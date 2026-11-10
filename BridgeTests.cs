using System;
using System.Net;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using System.Linq;
using System.Text;
using System.Collections.Generic;
using System.Web.Script.Serialization;

static class BridgeTests {
    sealed class InterruptedGemini : HttpMessageHandler {
        public int Calls;
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken token){
            int call=Interlocked.Increment(ref Calls);var json=new JavaScriptSerializer();
            string text=call==1 ? "{\"answers\":[{\"word\":\"hello\",\"estimatedTier\":\"Schooler\"}," : "{\"answers\":[{\"word\":\"salutations\",\"estimatedTier\":\"Rare\"}]}";
            string frame=json.Serialize(new {candidates=new[]{new {content=new {parts=new[]{new {text=text}}}}}});
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK){Content=new StreamContent(new System.IO.MemoryStream(Encoding.UTF8.GetBytes("data: "+frame+"\n\n")))});
        }
    }
    sealed class Model : HttpMessageHandler {
        public int Calls;
        public int BusyBeforeSuccess;
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken token){
            int call=Interlocked.Increment(ref Calls);await Task.Delay(20,token);
            if(call<=BusyBeforeSuccess)return new HttpResponseMessage(HttpStatusCode.ServiceUnavailable){Content=new StringContent("{}")};
            var json=new JavaScriptSerializer();
            string content=json.Serialize(new {answers=call==1 ? new[]{"salutations","hello","hi"} : new[]{"good morning"}});
            return new HttpResponseMessage(HttpStatusCode.OK){Content=new StringContent(json.Serialize(new {status="completed",output=new[]{new {content=new[]{new {type="output_text",text=content}}}}}))};
        }
    }
    static void Check(bool value,string message){if(!value)throw new Exception(message);}
    static async Task<Dictionary<string,object>> Post(HttpClient http,string url,string token,string path,object payload){
        using(var request=new HttpRequestMessage(HttpMethod.Post,url+path)){
            request.Headers.Authorization=new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer",token);
            request.Content=new StringContent(new JavaScriptSerializer().Serialize(payload),Encoding.UTF8,"application/json");
            using(var response=await http.SendAsync(request)){response.EnsureSuccessStatusCode();return (Dictionary<string,object>)new JavaScriptSerializer().DeserializeObject(await response.Content.ReadAsStringAsync());}
        }
    }
    public static async Task Run(){
        Check(!BridgeServer.Authorized(null,"secret") && !BridgeServer.Authorized("Bearer wrong","secret") && BridgeServer.Authorized("Bearer secret","secret"),"Bridge authentication");
        var model=new Model();
        using(var server=new BridgeServer(new AiSettings {Provider="OpenAI",Key="test-key",Model="test-model"},new AiClient(model),TimeSpan.FromMilliseconds(10)))
        using(var http=new HttpClient(new HttpClientHandler {UseProxy=false})){
            http.Timeout=TimeSpan.FromSeconds(10);
            string token=server.NewSession(),url="http://127.0.0.1:"+server.Port;
            using(var denied=await http.PostAsync(url+"/sync",new StringContent("{}")))Check(denied.StatusCode==HttpStatusCode.Forbidden,"Unauthenticated bridge accepted");
            object data=new {question="Name a greeting",categoryId="round-1",used=new[]{"hello"},history=""};
            var state=await Post(http,url,token,"/sync",data);
            Check((string)state["question"]=="Name a greeting","Question sync");
            for(int i=0;i<30 && ((object[])state["answers"]).Length==0;i++){await Task.Delay(100);state=await Post(http,url,token,"/sync",data);}
            Check(((object[])state["answers"]).Select(Convert.ToString).SequenceEqual(new[]{"salutations","hi"}),"Bridge did not filter used answers or preserve ranking");
            await Post(http,url,token,"/mark",new {word="hi"});
            state=await Post(http,url,token,"/sync",data);Check(((object[])state["answers"]).Length==1 && model.Calls==1,"Repeated sync triggered duplicate AI calls or lost used words");
            state=await Post(http,url,token,"/sync",new {question="Name a greeting",categoryId="round-2",used=new string[0],history=""});
            Check(((object[])state["answers"]).Length==3 && (int)state["usedCount"]==0 && model.Calls==1,"New round did not reset used words with cached suggestions");
            state=await Post(http,url,token,"/sync",new {question="Name a greeting",categoryId="round-2",used=new string[0],history="",rarities=new[]{new {word="hi",tier="Deep Cut"},new {word="hello",tier="Rare"}}});
            Check(Convert.ToString(((object[])state["answers"])[0])=="hi","Game-reported tiers did not reorder suggestions");
            var ranked=(Dictionary<string,object>)((object[])state["rankedAnswers"])[0];Check((string)ranked["source"]=="Game" && (int)ranked["score"]==85,"Game source/tier score lost");
            state=await Post(http,url,token,"/autoplay",new {enabled=true});Check((bool)state["autoPlay"],"Slime enable failed");
            state=await Post(http,url,token,"/autoplay",new {enabled=false});Check(!(bool)state["autoPlay"],"Slime disable failed");
            await Post(http,url,token,"/mark",new {word="hi"});
            state=await Post(http,url,token,"/reset",new {});Check(((object[])state["answers"]).Length==3 && (int)state["usedCount"]==0,"Manual reset failed");
            await Task.Delay(30);
            var continuous=new {question="Name a greeting",categoryId="round-2",used=new string[0],history="",continuous=true};
            for(int i=0;i<40 && ((object[])state["answers"]).Length<4;i++){state=await Post(http,url,token,"/sync",continuous);await Task.Delay(80);}
            Check(((object[])state["answers"]).Length==4 && model.Calls==2,"Continuous refill did not merge new answers");
            state=await Post(http,url,token,"/pause",new {});Check((bool)state["paused"],"Pause failed");
            string newToken=server.NewSession();
            using(var request=new HttpRequestMessage(HttpMethod.Post,url+"/sync")){
                request.Headers.Authorization=new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer",token);request.Content=new StringContent("{}");
                using(var denied=await http.SendAsync(request))Check(denied.StatusCode==HttpStatusCode.Forbidden,"Expired session accepted");
            }
            Check(newToken!=token,"Session token reused");
        }
        var recovering=new Model {BusyBeforeSuccess=1};
        using(var server=new BridgeServer(new AiSettings {Provider="OpenAI",Key="test-key",Model="test-model"},new AiClient(recovering)))
        using(var http=new HttpClient(new HttpClientHandler {UseProxy=false})){
            string token=server.NewSession(),url="http://127.0.0.1:"+server.Port;
            var data=new {question="Name a greeting",categoryId="recovery",used=new string[0],history="",continuous=true};
            var state=await Post(http,url,token,"/sync",data);
            for(int i=0;i<40&&((object[])state["answers"]).Length==0;i++){await Task.Delay(80);state=await Post(http,url,token,"/sync",data);}
            Check(recovering.Calls==2 && ((object[])state["answers"]).Length>0,"503 recovery required a manual retry");
        }
        var interrupted=new InterruptedGemini();
        using(var server=new BridgeServer(new AiSettings {Provider="Gemini",Key="test-google-key",Model="gemini-3.5-flash-lite"},new AiClient(interrupted)))
        using(var http=new HttpClient(new HttpClientHandler {UseProxy=false})){
            string token=server.NewSession(),url="http://127.0.0.1:"+server.Port;
            var data=new {question="Name a greeting",categoryId="stream-recovery",used=new string[0],history="",continuous=true};
            var state=await Post(http,url,token,"/sync",data);
            for(int i=0;i<45&&(int)state["batches"]==0;i++){await Task.Delay(80);state=await Post(http,url,token,"/sync",data);}
            Check(interrupted.Calls==2&&(int)state["batches"]==1,"Interrupted stream required manual retry");
            Check(((object[])state["answers"]).Select(Convert.ToString).SequenceEqual(new[]{"salutations","hello"}),"Partial suggestions lost or duplicated during stream recovery");
        }
    }
}
