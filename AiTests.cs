using System;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Collections.Generic;

static class AiTests {
    public static string Notes="";
    sealed class FakeHandler : HttpMessageHandler {
        public Func<HttpRequestMessage,CancellationToken,Task<HttpResponseMessage>> Reply;
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken token){return Reply(request,token);}
    }
    static void Check(bool condition,string message){if(!condition)throw new Exception(message);}
    static string Fixture(string status,string type,string text){return new JavaScriptSerializer().Serialize(new {status=status,output=new object[]{new {type="reasoning"},new {type="message",content=new[]{new {type=type,text=text}}}}});}
    static void MustFail(Action action,string message){try{action();}catch{ return;}throw new Exception(message);}
    public static async Task Run(){
        string payload=new JavaScriptSerializer().Serialize(new {answers=new[]{"salutations","hello","HELLO"," hi ","bad\nentry",""}});
        string fixture=Fixture("completed","output_text",payload);
        Check(AiClient.Parse(fixture).SequenceEqual(new[]{"salutations","hello","hi"}),"Answer order, trimming and deduplication");
        string geminiFixture=new JavaScriptSerializer().Serialize(new {candidates=new[]{new {finishReason="STOP",content=new {parts=new object[]{new {thought=true,text="ignore this"},new {text=payload}}}}}});
        Check(AiClient.ParseGemini(geminiFixture).SequenceEqual(new[]{"salutations","hello","hi"}),"Gemini parsing/order/deduplication");
        MustFail(()=>AiClient.ParseGemini("{\"candidates\":[{\"finishReason\":\"MAX_TOKENS\"}]}"),"Truncated Gemini response accepted");
        var google=new FakeHandler {Reply=async(request,token)=>{
            Check(request.RequestUri.Host=="generativelanguage.googleapis.com" && request.RequestUri.AbsolutePath.EndsWith("gemini-3.5-flash-lite:generateContent") && request.RequestUri.Query=="","Gemini endpoint or key in URL");
            Check(request.Headers.Authorization==null && request.Headers.GetValues("x-goog-api-key").Single()=="test-google-key","Gemini authentication");
            string body=await request.Content.ReadAsStringAsync();Check(body.Contains("MINIMAL") && body.Contains("1536") && !body.Contains("test-google-key"),"Gemini speed configuration or key leaked into body");
            return new HttpResponseMessage(HttpStatusCode.OK){Content=new StringContent(geminiFixture)};
        }};
        using(var client=new AiClient(google))Check((await client.Suggest("Gemini","test-google-key","gemini-3.5-flash-lite","Name a greeting",CancellationToken.None)).Count==3,"Gemini request");
        var busyGoogle=new FakeHandler {Reply=(request,token)=>Task.FromResult(new HttpResponseMessage(HttpStatusCode.ServiceUnavailable){Content=new StringContent("{}")})};
        using(var client=new AiClient(busyGoogle)){
            bool transient=false;try{await client.Suggest("Gemini","test-google-key","gemini-3.5-flash-lite","Name a greeting",CancellationToken.None);}catch(AiServiceException ex){transient=ex.StatusCode==503;}Check(transient,"Gemini 503 not classified as transient");
        }
        string partial="{\"answers\":[{\"word\":\"hello\",\"estimatedTier\":\"Schooler\"},";
        Check(AiClient.ParsePartial(partial).Single().word=="hello","First streaming word waits for complete JSON");
        Check(AiClient.ParsePartial("{\"answers\":[{\"word\":\"unfinished").Count==0,"Incomplete streaming word was published");
        bool interrupted=false;try{AiClient.FinishGeminiStream(partial,false);}catch(AiServiceException){interrupted=true;}Check(interrupted,"Truncated stream did not enter automatic recovery");
        Check(AiClient.FinishGeminiStream("{\"answers\":[{\"word\":\"hello\",\"estimatedTier\":\"Schooler\"}]}",false).Single().word=="hello","Complete JSON was rejected solely for missing STOP frame");
        var ranks=WordSuggestion.Sort(new[]{new WordSuggestion {word="common",tier="Plankton",source="Game"},new WordSuggestion {word="rare",tier="Rare",source="AI estimate"},new WordSuggestion {word="deep",tier="Deep Cut",source="Game"},new WordSuggestion {word="gem",tier="One in a Krillion",source="Game"}});
        Check(ranks.Select(x=>x.word).SequenceEqual(new[]{"gem","deep","rare","common"}),"Krillion tier order");
        var serializer=new JavaScriptSerializer();
        string second="{\"word\":\"salutations\",\"estimatedTier\":\"Rare\"}]}";
        string eventOne=serializer.Serialize(new {candidates=new[]{new {content=new {parts=new[]{new {text=partial}}}}}});
        string eventTwo=serializer.Serialize(new {candidates=new[]{new {finishReason="STOP",content=new {parts=new[]{new {text=second}}}}}});
        var streamHandler=new FakeHandler {Reply=(request,token)=>{
            Check(request.RequestUri.AbsolutePath.EndsWith(":streamGenerateContent") && request.RequestUri.Query=="?alt=sse","Gemini streaming endpoint");
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK){Content=new StreamContent(new System.IO.MemoryStream(System.Text.Encoding.UTF8.GetBytes("data: "+eventOne+"\n\ndata: "+eventTwo+"\n\n")))});
        }};
        var published=new List<List<WordSuggestion>>();
        using(var client=new AiClient(streamHandler)){
            var streamed=await client.SuggestRanked("Gemini","test-google-key","gemini-3.5-flash-lite","Name a greeting",CancellationToken.None,null,items=>published.Add(items));
            Check(published.Count==2 && published[0].Count==1 && published[0][0].word=="hello","No early streaming progress");
            Check(streamed.Select(x=>x.word).SequenceEqual(new[]{"salutations","hello"}),"Streaming final tier sort");
        }
        Check(AiClient.Parse(Fixture("completed","output_text","{\"answers\":[]}")).Count==0,"Empty answers");
        MustFail(()=>AiClient.Parse(Fixture("incomplete","output_text",payload)),"Incomplete response accepted");
        MustFail(()=>AiClient.Parse(Fixture("completed","refusal","")),"Refusal accepted");
        MustFail(()=>AiClient.Parse("{}"),"Malformed response accepted");
        var handler=new FakeHandler();
        handler.Reply=async(request,token)=>{
            Check(request.RequestUri.ToString()=="https://api.openai.com/v1/responses","Wrong endpoint");
            Check(request.Headers.Authorization.Scheme=="Bearer" && request.Headers.Authorization.Parameter=="test-key","Authentication header missing");
            var body=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(await request.Content.ReadAsStringAsync());
            Check((string)body["model"]=="test-model" && (string)body["input"]=="Name a greeting" && (bool)body["store"]==false,"Request fields");
            Check(!body.ContainsKey("api_key"),"Key leaked into body");
            return new HttpResponseMessage(HttpStatusCode.OK){Content=new StringContent(fixture)};
        };
        using(var client=new AiClient(handler))Check((await client.Suggest("test-key","test-model","Name a greeting",CancellationToken.None)).Count==3,"HTTP response parsing");
        handler=new FakeHandler {Reply=(request,token)=>Task.FromResult(new HttpResponseMessage((HttpStatusCode)429))};
        using(var client=new AiClient(handler)){
            bool rejected=false;try{await client.Suggest("test-key","test-model","Name a greeting",CancellationToken.None);}catch(InvalidOperationException ex){rejected=ex.Message.Contains("quota");}Check(rejected,"Quota error handling");
        }
        handler=new FakeHandler {Reply=async(request,token)=>{await Task.Delay(10000,token);return new HttpResponseMessage(HttpStatusCode.OK);}};
        using(var client=new AiClient(handler))using(var cancellation=new CancellationTokenSource()){
            cancellation.Cancel();bool cancelled=false;try{await client.Suggest("test-key","test-model","Name a greeting",cancellation.Token);}catch(OperationCanceledException){cancelled=true;}Check(cancelled,"Cancellation ignored");
        }
        try {string encrypted=AiSettings.Protect("test-secret-not-a-real-key");Check(!encrypted.Contains("test-secret") && AiSettings.Unprotect(encrypted)=="test-secret-not-a-real-key","Encrypted key roundtrip");Notes="Encrypted key roundtrip passed.";}
        catch(System.Security.Cryptography.CryptographicException){Notes="Encrypted key roundtrip could not run in the restricted test account. Session-only keys remain available.";}
        var tracker=new UsedTracker();tracker.SetCategory("Name a greeting!");tracker.Observe("Player 1: hello  +10");tracker.Match(new[]{"hello","hi"});Check(tracker.IsUsed("hello") && !tracker.IsUsed("hi"),"Screen history matching");
        tracker.Mark("hi");tracker.SetCategory("Name a greeting?");Check(tracker.IsUsed("HI"),"Punctuation reset category");
        tracker.SetCategory("Name a farewell");Check(!tracker.IsUsed("hello") && tracker.Count==0,"Category change kept used words");
        tracker.Observe("good morning");tracker.Match(new[]{"morning","good morning"});Check(tracker.IsUsed("good morning") && !tracker.IsUsed("morning"),"Partial multiword match");
        tracker.SetCategory("Name a greeting");tracker.Match(new[]{"hello","hi"});Check(!tracker.IsUsed("hello"),"Returning category kept previous round history");
    }
}
