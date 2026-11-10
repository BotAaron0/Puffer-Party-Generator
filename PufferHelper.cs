using System;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Drawing;
using System.Windows.Forms;
using System.Collections.Generic;
using System.Diagnostics;
using System.Threading.Tasks;
using System.Runtime.InteropServices;
using System.Reflection;
using System.Threading;

class Bank {
    public string Name;
    public string[] Keys, Words;
}
static class Program {
    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
    [STAThread] static void Main(string[] args) {
        SetProcessDPIAware();
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        if(args.Contains("--preview")){
            using(var form=new LauncherForm()){
                form.Show();Application.DoEvents();
                using(var bitmap=new Bitmap(form.Width,form.Height)){
                form.DrawToBitmap(bitmap,new Rectangle(Point.Empty,form.Size));
                bitmap.Save(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"launcher-preview.png"),System.Drawing.Imaging.ImageFormat.Png);
                }
                form.Hide();
            }
            return;
        }
        if (args.Contains("--self-test")) {
            var banks = new List<Bank> { new Bank { Name="Test", Keys=new[]{"greeting"}, Words=new[]{"hello","hi"} } };
            if (!Helper.Find(banks, "Name a greeting").Contains("hello") || !Helper.Find(banks, "Name an English word starting with hel").SequenceEqual(new[]{"hello"}) || Helper.Find(banks,"unknown category").Count!=0) Environment.Exit(1);
            try { AiTests.Run().GetAwaiter().GetResult(); BridgeTests.Run().GetAwaiter().GetResult(); }
            catch(Exception ex) {File.WriteAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"self-test.txt"),"FAIL: "+ex);Environment.Exit(1);}
            File.WriteAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"self-test.txt"), "PASS: Gemini/OpenAI requests, partial streaming, tier sorting, transient 503 recovery, continuous refill, shared Slime control, game tier evidence, caching, used words, round reset, cancellation, session authentication.\r\n"+AiTests.Notes);
            return;
        }
        Application.Run(args.Contains("--legacy") ? (Form)new Helper() : new LauncherForm());
    }
}
class Picker : Form {
    Point start; Rectangle box; bool dragging;
    public Rectangle Selected;
    public Picker(string instruction) {
        FormBorderStyle = FormBorderStyle.None; Bounds = SystemInformation.VirtualScreen;
        BackColor = Color.Black; Opacity = .35; TopMost = true; Cursor = Cursors.Cross; DoubleBuffered = true;
        KeyPreview = true; KeyDown += (s,e) => { if (e.KeyCode == Keys.Escape) { DialogResult = DialogResult.Cancel; Close(); } };
        MouseDown += (s,e) => { start=e.Location; dragging=true; };
        MouseMove += (s,e) => { if(dragging) { box=Rectangle.FromLTRB(Math.Min(start.X,e.X),Math.Min(start.Y,e.Y),Math.Max(start.X,e.X),Math.Max(start.Y,e.Y)); Invalidate(); } };
        MouseUp += (s,e) => { dragging=false; Selected=new Rectangle(box.X+Left,box.Y+Top,box.Width,box.Height); DialogResult=box.Width>10 && box.Height>10 ? DialogResult.OK : DialogResult.Cancel; Close(); };
        Paint += (s,e) => { using(var font=new Font("Segoe UI",20))e.Graphics.DrawString(instruction+" Escape cancels.", font, Brushes.White,30,30); e.Graphics.DrawRectangle(Pens.Lime,box); };
    }
}
class Helper : Form {
    TextBox prompt = new TextBox(), filter = new TextBox();
    ListBox results = new ListBox();
    Label status = new Label(), count = new Label();
    CheckBox auto = new CheckBox(), top = new CheckBox(), autoAi=new CheckBox(),showOverlay=new CheckBox();
    TopOverlay overlay;
    Button generate=new Button();
    ComboBox categories = new ComboBox();
    List<Bank> banks; UsedTracker tracker=new UsedTracker();
    List<string> words = new List<string>(); Rectangle region,historyRegion; bool busy,aiBusy; string lastPrompt="",pendingQuestion="",attempted="";
    int pendingReads;
    string source="Local";
    AiClient ai=new AiClient();AiSettings settings=AiSettings.Load();CancellationTokenSource aiCancellation;
    Dictionary<string,List<string>> cache=new Dictionary<string,List<string>>();
    DateTime changedAt=DateTime.UtcNow,lastAiAt=DateTime.MinValue;
    System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer();
    public static string Embedded(string name) { using(var r=new StreamReader(Assembly.GetExecutingAssembly().GetManifestResourceStream("PufferHelper."+name))) return r.ReadToEnd(); }
    public static List<Bank> LoadBanks() {
        string content=Embedded("answers.txt");
        string extra=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"custom-answers.txt");
        if(File.Exists(extra)) content += "\n"+File.ReadAllText(extra);
        var list=new List<Bank>();
        foreach(string line in content.Split('\n')) {
            var parts=line.Trim().Split('|'); if(parts.Length!=3 || line.StartsWith("#")) continue;
            list.Add(new Bank {Name=parts[0],Keys=parts[1].Split(';'),Words=parts[2].Split(';').Select(x=>x.Trim()).Where(x=>x.Length>0).ToArray()});
        } return list;
    }
    public static List<string> Find(List<Bank> banks,string question) {
        string q=question.ToLowerInvariant().Replace('“','"').Replace('”','"').Replace('’','\'');
        var all=banks.SelectMany(b=>b.Words).Distinct(StringComparer.OrdinalIgnoreCase);
        string dictionary=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"words.txt");
        if(File.Exists(dictionary)) all=all.Concat(File.ReadLines(dictionary).Select(x=>x.Trim()).Where(x=>x.Length>0)).Distinct(StringComparer.OrdinalIgnoreCase);
        var m=Regex.Match(q,@"(?:start(?:ing|s)?|begin(?:ning|s)?)\s+with\s+[""']?([a-z]+)");
        if(m.Success) return all.Where(w=>w.StartsWith(m.Groups[1].Value,StringComparison.OrdinalIgnoreCase)).OrderBy(w=>w.Length).ThenBy(w=>w).ToList();
        m=Regex.Match(q,@"end(?:ing|s)?\s+with\s+[""']?([a-z]+)");
        if(m.Success) return all.Where(w=>w.EndsWith(m.Groups[1].Value,StringComparison.OrdinalIgnoreCase)).OrderBy(w=>w).ToList();
        m=Regex.Match(q,@"contain(?:ing|s)?\s+(?:the\s+)?(?:letters?\s+)?[""']?([a-z]+)");
        if(m.Success) return all.Where(w=>w.IndexOf(m.Groups[1].Value,StringComparison.OrdinalIgnoreCase)>=0).OrderBy(w=>w).ToList();
        var matches=banks.Select(b=>new { Bank=b, Score=b.Keys.Where(k=>Regex.IsMatch(q,@"\b"+Regex.Escape(k.Trim().ToLowerInvariant())+@"\b")).Select(k=>k.Length).DefaultIfEmpty(0).Max() }).Where(x=>x.Score>0).ToList();
        if(matches.Count==0) return new List<string>();
        int best=matches.Max(x=>x.Score);
        return matches.Where(x=>x.Score==best).SelectMany(x=>x.Bank.Words).Distinct(StringComparer.OrdinalIgnoreCase).OrderBy(w=>w).ToList();
    }
    public Helper() {
        Text="Puffer Helper - AI"; Size=new Size(740,840); MinimumSize=new Size(700,760); Font=new Font("Segoe UI",10); StartPosition=FormStartPosition.CenterScreen;
        banks=LoadBanks();
        overlay=new TopOverlay(word=>{tracker.Mark(word);Render();});overlay.ClosedByUser+=()=>showOverlay.Checked=false;
        var layout=new TableLayoutPanel {Dock=DockStyle.Fill,ColumnCount=1,RowCount=13,Padding=new Padding(16)};
        Controls.Add(layout);
        foreach(int height in new[]{40,42,42,30,66,42,30,36,30})layout.RowStyles.Add(new RowStyle(SizeType.Absolute,height));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent,100));layout.RowStyles.Add(new RowStyle(SizeType.Absolute,42));layout.RowStyles.Add(new RowStyle(SizeType.Absolute,62));layout.RowStyles.Add(new RowStyle(SizeType.Absolute,42));
        layout.Controls.Add(new Label {Text="PUFFER HELPER  /  AI answers",AutoSize=true,Font=new Font("Segoe UI",14,FontStyle.Bold)},0,0);
        var buttons=new FlowLayoutPanel {Dock=DockStyle.Fill};
        AddButton(buttons,"Select question area",()=>Choose(false));AddButton(buttons,"Select played-word area",()=>Choose(true)); AddButton(buttons,"Read now",async()=>await Read());
        auto.Text="Auto read"; auto.AutoSize=true; buttons.Controls.Add(auto); top.Text="On top";top.AutoSize=true;top.CheckedChanged+=(s,e)=>TopMost=top.Checked;buttons.Controls.Add(top); layout.Controls.Add(buttons,0,1);
        var aiButtons=new FlowLayoutPanel {Dock=DockStyle.Fill};AddButton(aiButtons,"AI settings",()=>ConfigureAi());generate.Text="Get AI answers";generate.AutoSize=true;generate.Click+=async(s,e)=>await Generate();aiButtons.Controls.Add(generate);
        autoAi.Text="Auto AI (API credits)";autoAi.AutoSize=true;autoAi.CheckedChanged+=(s,e)=>{attempted="";changedAt=DateTime.UtcNow;};aiButtons.Controls.Add(autoAi);
        showOverlay.Text="Top overlay";showOverlay.AutoSize=true;showOverlay.Checked=true;showOverlay.CheckedChanged+=(s,e)=>{if(showOverlay.Checked){overlay.MoveToScreen(region);overlay.Show(this);}else overlay.Hide();};aiButtons.Controls.Add(showOverlay);layout.Controls.Add(aiButtons,0,2);
        layout.Controls.Add(new Label {Text="Detected question (editable). Category changes reset used words.",AutoSize=true},0,3);
        prompt.Multiline=true;prompt.MaxLength=2000;prompt.Dock=DockStyle.Fill;prompt.TextChanged+=(s,e)=>Solve(); layout.Controls.Add(prompt,0,4);
        categories.Dock=DockStyle.Fill; categories.DropDownStyle=ComboBoxStyle.DropDownList; categories.Items.Add("Choose a category manually…"); foreach(var b in banks) categories.Items.Add(b.Name);categories.SelectedIndex=0;
        categories.SelectedIndexChanged+=(s,e)=>{if(categories.SelectedIndex>0){prompt.Text=banks[categories.SelectedIndex-1].Keys[0];words=banks[categories.SelectedIndex-1].Words.ToList();source="Local";Render();}};layout.Controls.Add(categories,0,5);
        layout.Controls.Add(new Label {Text="Filter suggestions",AutoSize=true},0,6);
        filter.Dock=DockStyle.Fill;filter.TextChanged+=(s,e)=>Render(); layout.Controls.Add(filter,0,7);
        count.AutoSize=true;layout.Controls.Add(count,0,8);results.Dock=DockStyle.Fill;results.DoubleClick+=(s,e)=>Copy();layout.Controls.Add(results,0,9);
        var actions=new FlowLayoutPanel {Dock=DockStyle.Fill};AddButton(actions,"Copy selected",()=>Copy());AddButton(actions,"Mark used",()=>{var item=results.SelectedItem as RankedAnswer;if(item!=null){tracker.Mark(item.Word);Render();}});AddButton(actions,"Add used words",()=>AddUsed());AddButton(actions,"Reset used",()=>{tracker.Clear();Render();});layout.Controls.Add(actions,0,10);
        status.Dock=DockStyle.Fill;status.Text=string.IsNullOrEmpty(settings.LoadError) ? "Set up AI, then select question and played-word areas. Double-click an answer to copy it." : settings.LoadError;layout.Controls.Add(status,0,11);
        layout.Controls.Add(new Label {Dock=DockStyle.Fill,Text="AI receives question text only. API charges may apply. Suggestions may be incomplete or rejected by the game."},0,12);
        int ticks=0;timer.Interval=500;timer.Tick+=async(s,e)=>{
            ticks++;
            if(autoAi.Checked && !aiBusy && prompt.Text.Trim().Length>0 && attempted!=CacheKey() && (DateTime.UtcNow-changedAt).TotalSeconds>=1.5 && (DateTime.UtcNow-lastAiAt).TotalSeconds>=10) await Generate();
            if(ticks%5==0 && auto.Checked&&!busy&&!region.IsEmpty)await Read();
        };timer.Start();
        Shown+=(s,e)=>{if(showOverlay.Checked){overlay.MoveToScreen(region);overlay.Show(this);}};
        FormClosed+=(s,e)=>{timer.Stop();CancelAi();ai.Dispose();overlay.Dispose();}; Render();
    }
    void AddButton(Control panel,string text,Action action){var b=new Button {Text=text,AutoSize=true}; b.Click+=(s,e)=>action();panel.Controls.Add(b);}
    void Choose(bool history){bool wasTop=TopMost;overlay.Hide();Hide();using(var p=new Picker(history ? "Drag around played answers ONLY." : "Drag around the QUESTION only.")){if(p.ShowDialog()==DialogResult.OK){if(history)historyRegion=p.Selected;else region=p.Selected;status.Text="Area selected. Click Read now, or enable Auto read.";}}Show();TopMost=wasTop;if(showOverlay.Checked){overlay.MoveToScreen(region);overlay.Show(this);}}
    string CacheKey(){return settings.CacheIdentity+"\n"+UsedTracker.Normalize(prompt.Text);}
    void CancelAi(){if(aiCancellation!=null){aiCancellation.Cancel();aiCancellation=null;}aiBusy=false;generate.Enabled=true;}
    void Solve(){
        string normalized=UsedTracker.Normalize(prompt.Text);
        if(normalized==lastPrompt)return;
        CancelAi();tracker.SetCategory(normalized);lastPrompt=normalized;changedAt=DateTime.UtcNow;attempted="";filter.Clear();
        List<string> cached;if(cache.TryGetValue(CacheKey(),out cached)){words=new List<string>(cached);source="AI (cached)";}else{words=Find(banks,prompt.Text);source="Local";}
        Render();
    }
    void Render(){tracker.Match(words);string f=filter.Text.Trim();var visible=words.Where(w=>!tracker.IsUsed(w)&&w.IndexOf(f,StringComparison.OrdinalIgnoreCase)>=0).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();string selected=(results.SelectedItem as RankedAnswer)==null ? null : ((RankedAnswer)results.SelectedItem).Word;results.BeginUpdate();results.Items.Clear();int rank=1;foreach(var word in visible)results.Items.Add(new RankedAnswer {Word=word,Rank=rank++});if(selected!=null)for(int i=0;i<results.Items.Count;i++)if(((RankedAnswer)results.Items[i]).Word==selected){results.SelectedIndex=i;break;}results.EndUpdate();count.Text=source+": "+visible.Length+" suggestions / "+tracker.Count+" marked used";if(visible.Length==0)count.Text+=" - get AI answers or edit the question";overlay.SetAnswers(prompt.Text,visible,source.StartsWith("AI"));}
    void ConfigureAi(){using(var dialog=new AiSettingsDialog(settings)){if(dialog.ShowDialog(this)==DialogResult.OK){CancelAi();attempted="";status.Text="AI settings saved. Click Get AI answers.";}}}
    async Task Generate(){
        if(aiBusy)return;
        if(string.IsNullOrWhiteSpace(prompt.Text)){status.Text="Read or paste the category question first.";return;}
        if(string.IsNullOrWhiteSpace(settings.Key)){autoAi.Checked=false;ConfigureAi();if(string.IsNullOrWhiteSpace(settings.Key))return;}
        string requestKey=CacheKey();attempted=requestKey;List<string> cached;
        if(cache.TryGetValue(requestKey,out cached)){words=new List<string>(cached);source="AI (cached)";Render();status.Text="Using cached suggestions. Played words stay hidden for this category.";return;}
        var cancellation=new CancellationTokenSource();aiCancellation=cancellation;aiBusy=true;generate.Enabled=false;lastAiAt=DateTime.UtcNow;status.Text="Asking AI for suggestions...";
        try{
            var answer=await ai.Suggest(settings.Provider,settings.Key,settings.Model,prompt.Text,cancellation.Token);
            if(IsDisposed || cancellation.IsCancellationRequested || requestKey!=CacheKey())return;
            if(cache.Count>=50)cache.Clear();cache[requestKey]=new List<string>(answer);words=answer;source="AI";Render();
            status.Text=answer.Count==0 ? "AI had no confident answers. Check the detected question." : "AI suggestions ready. Used words are hidden; double-click to copy.";
        }catch(OperationCanceledException){if(!cancellation.IsCancellationRequested && !IsDisposed){autoAi.Checked=false;status.Text="AI request timed out. Click Get AI answers to retry.";}}
        catch(Exception ex){if(!IsDisposed && !cancellation.IsCancellationRequested){autoAi.Checked=false;status.Text=ex is InvalidOperationException ? ex.Message : "Could not reach the AI service. Check your connection and try again.";}}
        finally{if(aiCancellation==cancellation){aiCancellation=null;aiBusy=false;if(!IsDisposed)generate.Enabled=true;}cancellation.Dispose();}
    }
    void AddUsed(){
        using(var dialog=new Form {Text="Words already played in this category",ClientSize=new Size(420,250),StartPosition=FormStartPosition.CenterParent,MinimizeBox=false,MaximizeBox=false}){
            var text=new TextBox {Multiline=true,Left=12,Top=12,Width=396,Height=180,ScrollBars=ScrollBars.Vertical};dialog.Controls.Add(text);
            var add=new Button {Text="Add (one per line)",Left=200,Top=205,Width=208,DialogResult=DialogResult.OK};dialog.Controls.Add(add);dialog.AcceptButton=add;
            if(dialog.ShowDialog(this)==DialogResult.OK){foreach(var word in text.Text.Split(new[]{'\r','\n'},StringSplitOptions.RemoveEmptyEntries))tracker.Mark(word);Render();}
        }
    }
    void Copy(){var item=results.SelectedItem as RankedAnswer;if(item!=null){try{Clipboard.SetText(item.Word);status.Text="Copied: "+item.Word;}catch(Exception ex){status.Text=ex.Message;}}}
    async Task Read(){
        if(busy)return;if(region.IsEmpty){Choose(false);if(region.IsEmpty)return;}busy=true;
        try {
            string text=await ReadArea(region);
            if(IsDisposed)return;
            if(!string.IsNullOrWhiteSpace(text)){
                text=Regex.Replace(text,@"\s+"," ").Trim();
                string normalized=UsedTracker.Normalize(text);
                bool accepted=true;
                if(auto.Checked && lastPrompt.Length>0 && normalized!=lastPrompt){if(normalized==pendingQuestion)pendingReads++;else{pendingQuestion=normalized;pendingReads=1;}accepted=pendingReads>=2;}
                else{pendingQuestion="";pendingReads=0;}
                if(accepted && normalized!=lastPrompt)prompt.Text=text;
                if(accepted && !historyRegion.IsEmpty){string category=lastPrompt;string history=await ReadArea(historyRegion);if(IsDisposed)return;if(lastPrompt==category){tracker.Observe(history);Render();}}
                if(!aiBusy)status.Text=accepted ? "Screen read at "+DateTime.Now.ToLongTimeString()+". Used words tracked for the active category." : "Checking whether the category changed...";
            }else if(!aiBusy)status.Text="No question detected. Select a tighter area.";
        }catch(Exception ex){if(!IsDisposed){auto.Checked=false;status.Text="Read failed: "+ex.Message;}}finally{busy=false;}
    }
    async Task<string> ReadArea(Rectangle area){
        string folder=Path.Combine(Path.GetTempPath(),"PufferHelper-"+Guid.NewGuid().ToString("N"));
        try {
            Directory.CreateDirectory(folder);string png=Path.Combine(folder,"screen.png"),script=Path.Combine(folder,"ocr.ps1");
            using(var bitmap=new Bitmap(area.Width,area.Height)){using(var g=Graphics.FromImage(bitmap))g.CopyFromScreen(area.Location,Point.Empty,area.Size);bitmap.Save(png,System.Drawing.Imaging.ImageFormat.Png);}
            File.WriteAllText(script,Embedded("ocr.ps1"));
            return await Task.Run(()=>{
                var info=new ProcessStartInfo(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),@"WindowsPowerShell\v1.0\powershell.exe"),"-NoProfile -NonInteractive -ExecutionPolicy Bypass -File \""+script+"\" -ImagePath \""+png+"\"") {UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true,StandardOutputEncoding=Encoding.UTF8};
                using(var process=Process.Start(info)){var output=process.StandardOutput.ReadToEndAsync();var errors=process.StandardError.ReadToEndAsync();if(!process.WaitForExit(20000)){process.Kill();throw new Exception("OCR timed out.");}Task.WaitAll(output,errors);if(process.ExitCode!=0)throw new Exception(errors.Result);return output.Result.Trim().Trim('\uFEFF');}
            });
        } finally{try{Directory.Delete(folder,true);}catch{}}
    }
}
