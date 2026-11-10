using System;
using System.Collections.Generic;
using System.Linq;

sealed class WordSuggestion {
    public string word {get;set;}
    public string tier {get;set;}
    public string source {get;set;}
    public int score {get {return TierScore(tier);}}
    public static string CanonicalTier(string value){
        string text=UsedTracker.Normalize(value);
        switch(text){
            case "one in a krillion":case "krillion":return "One in a Krillion";
            case "deep cut":case "deepcut":return "Deep Cut";
            case "rare":return "Rare";
            case "schooler":return "Schooler";
            case "too clever":case "tooclever":return "Too Clever";
            case "plankton":return "Plankton";
            default:return "Unrated";
        }
    }
    public static int TierScore(string value){
        switch(CanonicalTier(value)){case "One in a Krillion":return 100;case "Deep Cut":return 85;case "Rare":return 60;case "Schooler":return 30;case "Too Clever":return 15;case "Plankton":return 10;default:return -1;}
    }
    public static List<WordSuggestion> Sort(IEnumerable<WordSuggestion> values){return values.OrderByDescending(x=>x.score).ThenByDescending(x=>x.source=="Game").ToList();}
}
