using System;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Web.Script.Serialization;

sealed class BrowserSync {
    public string question {get;set;}
    public string categoryId {get;set;}
    public string[] used {get;set;}
    public string history {get;set;}
    public bool continuous {get;set;}
    public WordSuggestion[] rarities {get;set;}
    public string extensionVersion {get;set;}
}
sealed class BridgeServer : IDisposable {
    readonly TcpListener listener=new TcpListener(IPAddress.Loopback,0);
    readonly SemaphoreSlim clients=new SemaphoreSlim(8);
    readonly object gate=new object();
    readonly AiSettings settings;
    readonly AiClient ai;
    readonly TimeSpan refillEvery;
    readonly UsedTracker used=new UsedTracker();
    readonly Dictionary<string,List<WordSuggestion>> cache=new Dictionary<string,List<WordSuggestion>>();
    readonly Dictionary<string,WordSuggestion> estimates=new Dictionary<string,WordSuggestion>();
    readonly Dictionary<string,WordSuggestion> gameTiers=new Dictionary<string,WordSuggestion>();
    List<string> answers=new List<string>();
    CancellationTokenSource request;
    string token="",question="",category="",status="Launch Krillion to connect the extension.";
    bool paused,disposed;
    bool refillBlocked;
    int batches;
    DateTime lastBatch=DateTime.MinValue;
    DateTime retryAt=DateTime.MinValue;
    int version;
    DateTime lastRequest=DateTime.MinValue;
    public int Port {get;private set;}
    public DateTime LastSeen {get;private set;}
    public string ExtensionVersion {get;private set;}
    bool autoPlay;
    long autoPlayRevision;
    public bool AutoPlay {get {lock(gate)return autoPlay;}}
    public void SetAutoPlay(bool enabled){lock(gate){autoPlay=enabled;autoPlayRevision++;}}
    public BridgeServer(AiSettings options) : this(options,new AiClient()) { }
    internal BridgeServer(AiSettings options,AiClient client,TimeSpan? refillInterval=null){settings=options;ai=client;refillEvery=refillInterval??TimeSpan.FromSeconds(18);listener.Start(16);Port=((IPEndPoint)listener.LocalEndpoint).Port;NewSession();AcceptLoop();}
    public string NewSession(){lock(gate){byte[] bytes=new byte[32];using(var rng=RandomNumberGenerator.Create())rng.GetBytes(bytes);token=BitConverter.ToString(bytes).Replace("-","").ToLowerInvariant();version++;Cancel();question="";category="";answers.Clear();estimates.Clear();gameTiers.Clear();used.Clear();paused=false;autoPlay=false;refillBlocked=false;retryAt=DateTime.MinValue;batches=0;ExtensionVersion="";LastSeen=DateTime.MinValue;status="Waiting for a game category...";return token;}}
    public string LaunchUrl {get {lock(gate)return "https://krillion.io/party#puffer="+Port+"."+token;}}
    void Cancel(){if(request!=null){request.Cancel();request=null;}}
    async void AcceptLoop(){
        while(!disposed){
            TcpClient client;
            try{client=await listener.AcceptTcpClientAsync().ConfigureAwait(false);}catch{break;}
            if(!clients.Wait(0)){client.Close();continue;}
            Handle(client);
        }
    }
    async void Handle(TcpClient client){
        try{await Task.Run(()=>Serve(client)).ConfigureAwait(false);}catch{}finally{client.Close();clients.Release();}
    }
    static string ReadLine(Stream stream,int maximum){
        var bytes=new List<byte>();int next;
        while((next=stream.ReadByte())!=-1){if(next==10)return Encoding.ASCII.GetString(bytes.ToArray()).TrimEnd('\r');bytes.Add((byte)next);if(bytes.Count>maximum)throw new IOException("Header too large");}
        throw new IOException("Incomplete request");
    }
    void Serve(TcpClient client){
        client.ReceiveTimeout=5000;client.SendTimeout=5000;
        using(var stream=client.GetStream()){
            string first=ReadLine(stream,4096);var pieces=first.Split(' ');
            if(pieces.Length!=3){Reply(stream,400,new {error="Invalid request"});return;}
            var headers=new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase);int total=first.Length;
            while(true){string line=ReadLine(stream,4096);total+=line.Length;if(total>16384)throw new IOException();if(line.Length==0)break;int colon=line.IndexOf(':');if(colon<1)throw new IOException();headers[line.Substring(0,colon)]=line.Substring(colon+1).Trim();}
            string host,auth;headers.TryGetValue("Host",out host);headers.TryGetValue("Authorization",out auth);
            if(pieces[0]!="POST" || !new[]{"/sync","/mark","/pause","/retry","/reset","/autoplay"}.Contains(pieces[1])){Reply(stream,404,new {error="Unknown operation"});return;}
            int length;string rawLength;
            if(headers.ContainsKey("Transfer-Encoding") || !headers.TryGetValue("Content-Length",out rawLength) || !int.TryParse(rawLength,out length) || length<0 || length>65536){Reply(stream,400,new {error="Invalid request size"});return;}
            var bytes=new byte[length];int read=0;while(read<length){int got=stream.Read(bytes,read,length-read);if(got==0)throw new IOException();read+=got;}
            lock(gate){if(host!="127.0.0.1:"+Port || !Authorized(auth,token)){Reply(stream,403,new {error="Session expired. Click Launch Krillion again."});return;}}
            var json=new JavaScriptSerializer {MaxJsonLength=65536};
            try{
                lock(gate){
                    if(!Authorized(auth,token)){Reply(stream,403,new {error="Session expired"});return;}
                    if(pieces[1]=="/sync")Sync(json.Deserialize<BrowserSync>(Encoding.UTF8.GetString(bytes)));
                    else if(pieces[1]=="/mark"){
                        var data=json.Deserialize<Dictionary<string,string>>(Encoding.UTF8.GetString(bytes));string word;
                        if(data!=null && data.TryGetValue("word",out word) && word.Length<=100)used.Mark(word);
                    } else if(pieces[1]=="/autoplay"){
                        var data=json.Deserialize<Dictionary<string,bool>>(Encoding.UTF8.GetString(bytes));bool enabled;if(data!=null&&data.TryGetValue("enabled",out enabled))SetAutoPlay(enabled);
                    } else if(pieces[1]=="/pause"){
                        paused=!paused;version++;Cancel();status=paused ? "Paused" : "Waiting for suggestions...";if(!paused && question.Length>0)Schedule();
                    } else if(pieces[1]=="/reset"){
                        used.Clear();
                    } else if(pieces[1]=="/retry"){
                        if(question.Length>0 && !paused && (DateTime.UtcNow-lastRequest).TotalSeconds>=2){cache.Remove(settings.CacheIdentity+"\n"+UsedTracker.Normalize(question));version++;Cancel();refillBlocked=false;Schedule(answers.Count>0);}
                    }
                    LastSeen=DateTime.UtcNow;used.Match(answers);
                    var ranked=Ranked().Where(x=>!used.IsUsed(x.word)).ToList();
                    Reply(stream,200,new {question=question,status=status,answers=ranked.Select(x=>x.word).ToArray(),rankedAnswers=ranked,usedCount=used.Count,paused=paused,autoPlay=autoPlay,autoPlayRevision=autoPlayRevision,estimated=ranked.Any(x=>x.source!="Game"),batches=batches,requiredExtensionVersion="2.2.0"});
                }
            }catch(ArgumentException){Reply(stream,400,new {error="Invalid game data"});}
             catch(InvalidOperationException){Reply(stream,400,new {error="Invalid game data"});}
        }
    }
    internal static bool Authorized(string header,string secret){
        string expected="Bearer "+secret;if(header==null || header.Length!=expected.Length)return false;int diff=0;for(int i=0;i<header.Length;i++)diff|=header[i]^expected[i];return diff==0;
    }
    void Sync(BrowserSync data){
        ExtensionVersion=(data==null?"":data.extensionVersion)??"";
        if(data==null || (data.question ?? "").Length>2000 || (data.categoryId ?? "").Length>500 || (data.history ?? "").Length>15000 || (data.used!=null && (data.used.Length>300 || data.used.Any(x=>x==null || x.Length>100))) || (data.rarities!=null && (data.rarities.Length>300 || data.rarities.Any(x=>x==null || (x.word??"").Length>100 || (x.tier??"").Length>40))))throw new ArgumentException();
        string text=(data.question ?? "").Trim();
        if(text.Length==0){
            if(question.Length>0){version++;Cancel();question="";category="";answers.Clear();estimates.Clear();gameTiers.Clear();used.SetCategory("");}
            status=paused ? "Paused" : "Waiting for a game category...";return;
        }
        string identity=UsedTracker.Normalize(text)+"|"+(data.categoryId ?? "");
        if(identity!=category){
            version++;Cancel();category=identity;question=text;used.Clear();used.SetCategory(identity);answers.Clear();estimates.Clear();gameTiers.Clear();refillBlocked=false;retryAt=DateTime.MinValue;batches=0;
            if(!paused)Schedule();
        }
        if(data.used!=null)foreach(string word in data.used)used.Mark(word);
        if(!string.IsNullOrWhiteSpace(data.history))used.Observe(data.history);
        if(data.rarities!=null)foreach(var entry in data.rarities){string tier=WordSuggestion.CanonicalTier(entry.tier);if(!string.IsNullOrWhiteSpace(entry.word) && tier!="Unrated")gameTiers[UsedTracker.Normalize(entry.word)]=new WordSuggestion {word=entry.word.Trim(),tier=tier,source="Game"};}
        if(data.continuous && !paused && request==null && retryAt!=DateTime.MinValue && DateTime.UtcNow>=retryAt){refillBlocked=false;Schedule(answers.Count>0);}
        else if(data.continuous && !paused && request==null && !refillBlocked && answers.Count>0 && answers.Count<120 && DateTime.UtcNow-lastBatch>=refillEvery)Schedule(true);
    }
    List<WordSuggestion> Ranked(){return WordSuggestion.Sort(answers.Select(word=>{string key=UsedTracker.Normalize(word);WordSuggestion found;if(gameTiers.TryGetValue(key,out found))return new WordSuggestion {word=word,tier=found.tier,source="Game"};if(estimates.TryGetValue(key,out found))return found;return new WordSuggestion {word=word,tier="Unrated",source="AI estimate"};}));}
    void Merge(IEnumerable<WordSuggestion> words){foreach(var entry in words){string key=UsedTracker.Normalize(entry.word);if(!estimates.ContainsKey(key)){estimates[key]=entry;answers.Add(entry.word);}else if(entry.score>estimates[key].score)estimates[key]=entry;}answers=Ranked().Select(x=>x.word).ToList();used.Match(answers);}
    void Schedule(bool extend=false){
        retryAt=DateTime.MinValue;
        string key=settings.CacheIdentity+"\n"+UsedTracker.Normalize(question);List<WordSuggestion> found;
        if(!extend && cache.TryGetValue(key,out found)){Merge(found);lastBatch=DateTime.UtcNow;status="Ready - live rarity order";return;}
        if(string.IsNullOrWhiteSpace(settings.Key)){status="Add your API key in the desktop app, then press Retry.";return;}
        status=extend ? "Finding more rare suggestions..." : "Streaming suggestions...";var cancellation=new CancellationTokenSource();request=cancellation;
        int generation=version;string text=question,model=settings.Model,apiKey=settings.Key,provider=settings.Provider;
        double wait=Math.Max(80,(2-(DateTime.UtcNow-lastRequest).TotalSeconds)*1000);
        string[] excluded=extend ? answers.ToArray() : new string[0];
        Generate(generation,text,provider,model,apiKey,key,cancellation,(int)wait,excluded);
    }
    async void Generate(int generation,string text,string provider,string model,string apiKey,string cacheKey,CancellationTokenSource cancellation,int delay,string[] excluded){
        int before=0;
        try{
            await Task.Delay(delay,cancellation.Token).ConfigureAwait(false);
            lock(gate){if(generation!=version || disposed)return;lastRequest=DateTime.UtcNow;before=answers.Count;}
            List<WordSuggestion> words=null;
            for(int attempt=0;attempt<3;attempt++){
                int seconds=attempt==0?1:3;
                try{
                    words=await ai.SuggestRanked(provider,apiKey,model,text,cancellation.Token,excluded,partial=>{lock(gate){if(generation==version && !disposed && !cancellation.IsCancellationRequested){Merge(partial);status="Streaming - rarest tiers first";}}}).ConfigureAwait(false);
                    break;
                }catch(Exception ex){
                    if(cancellation.IsCancellationRequested)throw;
                    bool transient=ex is AiServiceException || ex is System.Net.Http.HttpRequestException || ex is System.IO.IOException || ex is OperationCanceledException;
                    if(!transient)throw;
                    lock(gate){if(generation!=version || disposed)return;status=provider+" temporarily unavailable. "+(attempt<2 ? "Automatic retry in "+seconds+"s..." : "Cooling down; automatic retry in 30s.");}
                    if(attempt==2){lock(gate){if(generation==version&&!disposed){refillBlocked=true;retryAt=DateTime.UtcNow.AddSeconds(30);}}return;}
                }
                await Task.Delay(TimeSpan.FromSeconds(seconds),cancellation.Token).ConfigureAwait(false);
            }
            if(words==null)return;
            lock(gate){if(generation!=version || disposed || cancellation.IsCancellationRequested)return;Merge(words);if(cache.Count>=50)cache.Clear();cache[cacheKey]=Ranked().Select(x=>new WordSuggestion {word=x.word,tier=estimates[UsedTracker.Normalize(x.word)].tier,source="AI estimate"}).ToList();lastBatch=DateTime.UtcNow;batches++;if(answers.Count==before)refillBlocked=true;status=answers.Count==0 ? "No confident suggestions. Check the detected question." : "Live - game tiers where available; otherwise AI estimates";}
        }catch(OperationCanceledException){lock(gate){if(generation==version && !disposed && !cancellation.IsCancellationRequested){refillBlocked=true;status="AI timed out. Press Retry.";}}}
         catch(Exception ex){lock(gate){if(generation==version && !disposed && !cancellation.IsCancellationRequested){refillBlocked=true;status=ex is InvalidOperationException ? ex.Message : "AI connection failed. Check your connection, then press Retry.";}}}
        finally{lock(gate){if(request==cancellation)request=null;}cancellation.Dispose();}
    }
    static void Reply(Stream stream,int code,object payload){
        byte[] body=Encoding.UTF8.GetBytes(new JavaScriptSerializer().Serialize(payload));
        byte[] header=Encoding.ASCII.GetBytes("HTTP/1.1 "+code+" "+(code==200?"OK":"Error")+"\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: "+body.Length+"\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n");stream.Write(header,0,header.Length);stream.Write(body,0,body.Length);
    }
    public void Dispose(){lock(gate){if(disposed)return;disposed=true;version++;Cancel();listener.Stop();ai.Dispose();}}
}
