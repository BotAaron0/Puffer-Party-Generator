using System;
using System.Drawing;
using System.IO;
using System.Diagnostics;
using System.Windows.Forms;

sealed class LauncherForm : Form {
    readonly AiSettings settings=AiSettings.Load();
    BridgeServer bridge;
    readonly Label connection=new Label();
    readonly System.Windows.Forms.Timer timer=new System.Windows.Forms.Timer();
    public LauncherForm(){
        Text="Puffer Party Helper";ClientSize=new Size(460,530);FormBorderStyle=FormBorderStyle.FixedSingle;MaximizeBox=false;
        StartPosition=FormStartPosition.CenterScreen;BackColor=Color.FromArgb(24,22,13);ForeColor=Color.FromArgb(255,247,217);Font=new Font("Segoe UI",10);
        Controls.Add(new Label {Text="made by BotAaron_",Left=30,Top=20,Width=400,Height=22,ForeColor=Color.FromArgb(255,214,64),Font=new Font("Segoe UI",10)});
        Controls.Add(new Label {Text="Puffer Party Helper",Left=28,Top=48,Width=410,Height=50,Font=new Font("Segoe UI",23,FontStyle.Bold)});
        Controls.Add(new Label {Text="Version 2.3.2\nGrind mode with background play\nAutomatic refill and letter-by-letter typing",Left=30,Top=112,Width=400,Height=75,ForeColor=Color.FromArgb(197,181,131)});
        var launch=Button("Launch Krillion  >",30,200,400,56,true);launch.Click+=(s,e)=>Launch();Controls.Add(launch);
        var slime=Button("Autofill",30,270,400,44,false);Controls.Add(slime);slime.Click+=(s,e)=>{if(bridge!=null)bridge.SetAutoPlay(!bridge.AutoPlay);};
        var api=Button("API settings",30,330,192,40,false);api.Click+=(s,e)=>{using(var dialog=new AiSettingsDialog(settings))dialog.ShowDialog(this);};Controls.Add(api);
        var extension=Button("Extension setup",238,330,192,40,false);extension.Click+=(s,e)=>{try{Process.Start(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"extension","SETUP.html"));}catch{MessageBox.Show(this,"Keep the extension folder beside the EXE, then open its SETUP.html file.");}};Controls.Add(extension);
        connection.SetBounds(30,394,400,60);connection.ForeColor=Color.FromArgb(197,181,131);connection.Text="Extension v2.2 required. Reload it once in your browser.\nThen launch and play.";Controls.Add(connection);
        Controls.Add(new Label {Text="Streaming / Krillion tiers + labeled AI estimates",Left=30,Top=489,Width=400,Height=25,ForeColor=Color.FromArgb(149,133,88),Font=new Font("Segoe UI",9)});
        try{bridge=new BridgeServer(settings);}catch{launch.Enabled=false;connection.Text="Could not start the local extension connection. Close other helper instances and reopen.";}
        timer.Interval=400;timer.Tick+=(s,e)=>{if(bridge!=null){slime.BackColor=bridge.AutoPlay?Color.FromArgb(255,214,64):Color.FromArgb(49,43,23);slime.ForeColor=bridge.AutoPlay?Color.FromArgb(36,29,6):ForeColor;if(bridge.LastSeen!=DateTime.MinValue)connection.Text=(DateTime.UtcNow-bridge.LastSeen).TotalSeconds<6 ? (bridge.ExtensionVersion=="2.2.0" ? "Connected / yellow extension\nStreaming suggestions; live used-word filtering." : "Old extension detected. Reload it in Extensions.\nThen close the old game tab and launch again.") : "Waiting for your Krillion tab...\nKeep the desktop app open while playing.";}};timer.Start();
        FormClosed+=(s,e)=>{timer.Stop();if(bridge!=null)bridge.Dispose();};
        Disposed+=(s,e)=>{timer.Dispose();if(bridge!=null)bridge.Dispose();};
        LauncherLayout.EnableDpiScaling(this);
    }
    Button Button(string text,int x,int y,int width,int height,bool primary){
        var button=new Button {Text=text,Left=x,Top=y,Width=width,Height=height,FlatStyle=FlatStyle.Flat,BackColor=primary ? Color.FromArgb(255,214,64) : Color.FromArgb(49,43,23),ForeColor=primary ? Color.FromArgb(36,29,6) : ForeColor,Font=new Font("Segoe UI",primary?14:10,FontStyle.Bold),Cursor=Cursors.Hand};button.FlatAppearance.BorderSize=0;return button;
    }
    void Launch(){
        if(string.IsNullOrWhiteSpace(settings.Key)){using(var dialog=new AiSettingsDialog(settings))if(dialog.ShowDialog(this)!=DialogResult.OK || string.IsNullOrWhiteSpace(settings.Key))return;}
        if(!Directory.Exists(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"extension"))){MessageBox.Show(this,"Extract the full ZIP, including its extension folder, before launching.");return;}
        bridge.NewSession();
        try{Process.Start(bridge.LaunchUrl);connection.Text="Opening Krillion...\nIf the panel is missing, use Extension setup.";}catch{connection.Text="Could not open your default browser. Check your Windows browser settings.";}
    }
}
static class LauncherLayout {
    // These forms use 96-DPI design coordinates. Fonts already follow Windows DPI.
    public static void EnableDpiScaling(Form form){
        form.AutoScaleMode=AutoScaleMode.None;
        form.Load+=(s,e)=>{
            float factor;using(var graphics=form.CreateGraphics())factor=graphics.DpiX/96f;
            if(Math.Abs(factor-1f)<.01f)return;
            Size original=form.ClientSize;foreach(Control control in form.Controls)control.Scale(new SizeF(factor,factor));
            form.ClientSize=new Size((int)Math.Round(original.Width*factor),(int)Math.Round(original.Height*factor));
            Rectangle area=Screen.FromControl(form).WorkingArea;
            form.Location=new Point(area.Left+(area.Width-form.Width)/2,area.Top+(area.Height-form.Height)/2);
        };
    }
}
