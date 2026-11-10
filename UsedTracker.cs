using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;

// Category changes clear only played-word state; AI suggestions may be cached separately.
sealed class UsedTracker {
    string category="";
    readonly HashSet<string> used=new HashSet<string>(StringComparer.Ordinal);
    readonly HashSet<string> observations=new HashSet<string>(StringComparer.Ordinal);
    public static string Normalize(string value){return Regex.Replace((value ?? "").Normalize(NormalizationForm.FormKC).ToLowerInvariant(),@"[^\p{L}\p{N}]+"," ").Trim();}
    public void SetCategory(string value){value=Normalize(value);if(value!=category){Clear();category=value;}}
    public int Count {get{return used.Count;}}
    public void Clear(){used.Clear();observations.Clear();}
    public void Mark(string value){value=Normalize(value);if(value.Length>0)used.Add(value);}
    public bool IsUsed(string value){return used.Contains(Normalize(value));}
    public void Observe(string text){if(!string.IsNullOrWhiteSpace(text)&&observations.Count<1000)observations.Add(Normalize(text));}
    public void Match(IEnumerable<string> candidates){
        var ordered=candidates.Select(Normalize).Where(x=>x.Length>0).Distinct().OrderByDescending(x=>x.Length).ToArray();
        foreach(var observation in observations){
            string remaining=" "+observation+" ";
            foreach(string word in ordered){string token=" "+word+" ";if(remaining.Contains(token)){used.Add(word);remaining=remaining.Replace(token," ");}}
        }
    }
}
