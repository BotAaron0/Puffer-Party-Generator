using System;
using System.Drawing;
using System.Linq;
using System.Windows.Forms;
using System.Collections.Generic;

sealed class RankedAnswer {
    public string Word; public int Rank;
    public override string ToString(){return Rank+". "+Word;}
}
sealed class TopOverlay : Form {
    readonly ListBox list=new ListBox();readonly Label category=new Label(),note=new Label();
    readonly Action<string> mark;
    public event Action ClosedByUser;
    public TopOverlay(Action<string> onMark) {
        mark=onMark;Text="Puffer Helper - top suggestions";TopMost=true;ShowInTaskbar=false;
        FormBorderStyle=FormBorderStyle.SizableToolWindow;Size=new Size(650,255);MinimumSize=new Size(460,210);Font=new Font("Segoe UI",11);
        var layout=new TableLayoutPanel {Dock=DockStyle.Fill,ColumnCount=1,RowCount=4,Padding=new Padding(8)};
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute,25));layout.RowStyles.Add(new RowStyle(SizeType.Absolute,26));layout.RowStyles.Add(new RowStyle(SizeType.Percent,100));layout.RowStyles.Add(new RowStyle(SizeType.Absolute,35));Controls.Add(layout);
        category.Dock=DockStyle.Fill;category.AutoEllipsis=true;layout.Controls.Add(category,0,0);
        note.Dock=DockStyle.Fill;note.Font=new Font("Segoe UI",9);layout.Controls.Add(note,0,1);
        list.Dock=DockStyle.Fill;list.Font=new Font("Segoe UI",12);list.DoubleClick+=(s,e)=>Copy();layout.Controls.Add(list,0,2);
        var actions=new FlowLayoutPanel {Dock=DockStyle.Fill};var copy=new Button {Text="Copy",AutoSize=true};copy.Click+=(s,e)=>Copy();actions.Controls.Add(copy);
        var used=new Button {Text="Mark used",AutoSize=true};used.Click+=(s,e)=>{var item=list.SelectedItem as RankedAnswer;if(item!=null)mark(item.Word);};actions.Controls.Add(used);layout.Controls.Add(actions,0,3);
        FormClosing+=(s,e)=>{if(e.CloseReason==CloseReason.UserClosing){e.Cancel=true;Hide();if(ClosedByUser!=null)ClosedByUser();}};
    }
    public void MoveToScreen(Rectangle questionArea) {
        var screen=questionArea.IsEmpty ? Screen.PrimaryScreen : Screen.FromRectangle(questionArea);
        var area=screen.WorkingArea;Width=Math.Min(650,area.Width-20);Location=new Point(area.Left+(area.Width-Width)/2,area.Top+8);
    }
    public void SetAnswers(string question,IEnumerable<string> words,bool estimated){
        string selected=(list.SelectedItem as RankedAnswer)==null ? null : ((RankedAnswer)list.SelectedItem).Word;
        category.Text=string.IsNullOrWhiteSpace(question) ? "Read or paste a question in the main window" : question;
        note.Text=estimated ? "AI-estimated rarity: 1 = rarest. Krillion scores are unknown." : "Waiting for AI suggestions. Local lists are unranked.";
        list.BeginUpdate();list.Items.Clear();int rank=1;foreach(string word in words)list.Items.Add(new RankedAnswer {Word=word,Rank=rank++});
        if(selected!=null)for(int i=0;i<list.Items.Count;i++)if(((RankedAnswer)list.Items[i]).Word==selected){list.SelectedIndex=i;break;}
        list.EndUpdate();
    }
    void Copy(){var item=list.SelectedItem as RankedAnswer;if(item!=null){try{Clipboard.SetText(item.Word);}catch{note.Text="Clipboard busy. Try copying again.";}}}
}
