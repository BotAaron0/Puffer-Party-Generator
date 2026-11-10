using System;
using System.IO;
using System.Text;
using System.Drawing;
using System.Security.Cryptography;
using System.Windows.Forms;
using System.Web.Script.Serialization;

sealed class AiSettings {
    public string Provider="Gemini";
    public string Model="gemini-3.5-flash-lite";
    public string CacheIdentity {get{return Provider+"\n"+Model;}}
    public static string DefaultModel(string provider){return provider=="Gemini" ? "gemini-3.5-flash-lite" : "gpt-4.1-mini";}
    public string Key="";
    public bool Remember;
    public string LoadError="";
    static string Folder { get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"PufferHelper"); } }
    static string FilePath { get { return Path.Combine(Folder,"ai-settings.json"); } }
    internal static string Protect(string key) { return Convert.ToBase64String(ProtectedData.Protect(Encoding.UTF8.GetBytes(key),null,DataProtectionScope.CurrentUser)); }
    internal static string Unprotect(string key) { return Encoding.UTF8.GetString(ProtectedData.Unprotect(Convert.FromBase64String(key),null,DataProtectionScope.CurrentUser)); }
    public static AiSettings Load() {
        var result=new AiSettings();
        try {
            if(File.Exists(FilePath)) {
                var saved=new JavaScriptSerializer().Deserialize<Saved>(File.ReadAllText(FilePath));
                if(saved!=null) {
                    result.Provider=saved.Provider=="Gemini" ? "Gemini" : "OpenAI";
                    result.Model=DefaultModel(result.Provider);
                    if(!string.IsNullOrWhiteSpace(saved.Model))result.Model=saved.Model;
                    if(!string.IsNullOrWhiteSpace(saved.EncryptedKey)){result.Key=Unprotect(saved.EncryptedKey);result.Remember=true;}
                    if(string.IsNullOrEmpty(saved.Provider) && result.Key.StartsWith("AIza",StringComparison.Ordinal)){result.Provider="Gemini";result.Model=DefaultModel("Gemini");}
                }
            }
        } catch {result.LoadError="Saved AI settings could not be read. Enter your key again in AI settings.";}
        if(string.IsNullOrEmpty(result.Key))result.Key=Environment.GetEnvironmentVariable(result.Provider=="Gemini" ? "GEMINI_API_KEY" : "OPENAI_API_KEY") ?? "";
        return result;
    }
    public void Save() {
        Directory.CreateDirectory(Folder);
        var saved=new Saved { Provider=Provider,Model=Model,EncryptedKey=Remember && !string.IsNullOrEmpty(Key) ? Protect(Key) : "" };
        File.WriteAllText(FilePath,new JavaScriptSerializer().Serialize(saved));
    }
    public class Saved { public string Provider {get;set;} public string Model {get;set;} public string EncryptedKey {get;set;} }
}
sealed class AiSettingsDialog : Form {
    public AiSettingsDialog(AiSettings settings) {
        Text="AI settings";ClientSize=new Size(510,390);FormBorderStyle=FormBorderStyle.FixedDialog;
        MaximizeBox=false;MinimizeBox=false;StartPosition=FormStartPosition.CenterParent;Font=new Font("Segoe UI",10);
        var info=new Label {Left=16,Top=16,Width=478,Height=58,Text="Choose the provider that issued your key. Only question text is sent to that provider. Free-tier limits and API charges may apply."};Controls.Add(info);
        var provider=new ComboBox {Left=16,Top=84,Width=478,DropDownStyle=ComboBoxStyle.DropDownList};provider.Items.AddRange(new object[]{"Gemini","OpenAI"});provider.SelectedItem=settings.Provider;Controls.Add(provider);
        var keyLabel=new Label {Left=16,Top=127,Width=450,Text=settings.Provider+" API key"};Controls.Add(keyLabel);
        var key=new TextBox {Left=16,Top=154,Width=478,UseSystemPasswordChar=true,Text=settings.Key};Controls.Add(key);
        var remember=new CheckBox {Left=16,Top=189,Width=478,Text="Remember key for this Windows account (encrypted)",Checked=settings.Remember};Controls.Add(remember);
        Controls.Add(new Label {Left=16,Top=227,Width=140,Text="Model (fast default)"});
        var model=new TextBox {Left=16,Top=254,Width=300,Text=settings.Model};Controls.Add(model);
        var link=new LinkLabel {Left=325,Top=257,Width=170,Text="Get an API key"};link.LinkClicked+=(s,e)=>System.Diagnostics.Process.Start((string)provider.SelectedItem=="Gemini" ? "https://aistudio.google.com/apikey" : "https://platform.openai.com/api-keys");Controls.Add(link);
        provider.SelectedIndexChanged+=(s,e)=>{keyLabel.Text=provider.SelectedItem+" API key";key.Text="";model.Text=AiSettings.DefaultModel((string)provider.SelectedItem);};
        var save=new Button {Left=308,Top=330,Width=90,Text="Save"};var cancel=new Button {Left=404,Top=330,Width=90,Text="Cancel",DialogResult=DialogResult.Cancel};Controls.Add(save);Controls.Add(cancel);CancelButton=cancel;AcceptButton=save;
        save.Click+=(s,e)=>{
            if(string.IsNullOrWhiteSpace(model.Text)){MessageBox.Show(this,"Enter a model name.");return;}
            string selected=(string)provider.SelectedItem;
            if((selected=="OpenAI" && key.Text.Trim().StartsWith("AIza")) || (selected=="Gemini" && key.Text.Trim().StartsWith("sk-"))){MessageBox.Show(this,"This key belongs to a different provider. Choose the matching provider and paste its key.");return;}
            if(string.IsNullOrWhiteSpace(key.Text)){MessageBox.Show(this,"Paste your "+selected+" API key first.");return;}
            try {settings.Provider=selected;settings.Key=key.Text.Trim();settings.Model=model.Text.Trim();settings.Remember=remember.Checked;settings.Save();DialogResult=DialogResult.OK;Close();}
            catch {settings.Remember=false;MessageBox.Show(this,"Settings will apply to this session only. The key could not be saved. Uncheck Remember key to remove an older saved key when storage is available.");DialogResult=DialogResult.OK;Close();}
        };
        BackColor=Color.FromArgb(24,22,13);ForeColor=Color.FromArgb(255,247,217);
        foreach(Control control in Controls){
            control.ForeColor=ForeColor;
            var textBox=control as TextBox;if(textBox!=null){textBox.BackColor=Color.FromArgb(49,43,23);textBox.BorderStyle=BorderStyle.FixedSingle;}
            var button=control as Button;if(button!=null){button.FlatStyle=FlatStyle.Flat;button.BackColor=Color.FromArgb(49,43,23);button.FlatAppearance.BorderColor=Color.FromArgb(102,83,37);}
            var linkLabel=control as LinkLabel;if(linkLabel!=null)linkLabel.LinkColor=Color.FromArgb(255,214,64);
        }
        LauncherLayout.EnableDpiScaling(this);
    }
}
