export interface Character {
    id: number;
    name: string;
    gender: 'Male' | 'Female';
    affiliation: string; // e.g., "Mount Hua Sect", "Southern Edge Sect", "Beggars' Union"
    height: 'Short' | 'Average' | 'Tall' | 'Unknown'; // Using categories for simplicity, adjust as needed
    firstSeenChapter: number; // Manhwa Chapter number
    aliases: string[];
  }
  
  export type AttributeResult = 'correct' | 'incorrect' | 'partial' | 'higher' | 'lower' | 'earlier' | 'later';
  
  export interface GuessComparison {
    name: any;
    gender: AttributeResult;
    affiliation: AttributeResult;
    height: AttributeResult; // 'correct', 'higher', 'lower', 'incorrect' (if Unknown vs Known)
    firstSeenChapter: AttributeResult; // 'correct', 'earlier', 'later'
    aliases: AttributeResult; // 'correct', 'partial' (some match), 'incorrect' (none match)
  }
  
  export interface GuessResult {
    guessedCharacter: Character;
    comparison: GuessComparison;
  }