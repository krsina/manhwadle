import React, { useState } from 'react';
// No longer need to import './App.css';
import InputForm from './components/InputForm';
import GuessResultsList from './components/GuessResultsList';
import { Character, GuessResult, GuessComparison } from './types'; // Assuming GuessComparison is also in types

// --- Hardcoded Data ---

// The character to guess
const correctAnswer: Character = {
  id: 1,
  name: "Cheong Myeong",
  gender: "Male",
  affiliation: "Mount Hua Sect",
  height: "Average",
  firstSeenChapter: 1,
  aliases: ["Plum Blossom Sword Saint", "Chung Myung"],
};

// List of characters available for guessing (will come from Supabase later)
// Make sure this list is comprehensive enough for testing
const availableCharacters: Character[] = [
  { id: 1, name: "Cheong Myeong", gender: "Male", affiliation: "Mount Hua Sect", height: "Average", firstSeenChapter: 1, aliases: ["Plum Blossom Sword Saint", "Chung Myung"] },
  { id: 2, name: "Jo Geol", gender: "Male", affiliation: "Mount Hua Sect", height: "Tall", firstSeenChapter: 15, aliases: [] },
  { id: 3, name: "Yoon Jong", gender: "Male", affiliation: "Mount Hua Sect", height: "Average", firstSeenChapter: 15, aliases: [] },
  { id: 4, name: "Yu Iseol", gender: "Female", affiliation: "Mount Hua Sect", height: "Average", firstSeenChapter: 20, aliases: ["Plum Blossom Sword"] },
  { id: 5, name: "Baek Cheon", gender: "Male", affiliation: "Mount Hua Sect", height: "Tall", firstSeenChapter: 10, aliases: ["Righteous Sword"] },
  { id: 6, name: "Tang Soso", gender: "Female", affiliation: "Tang Family", height: "Short", firstSeenChapter: 50, aliases: [] },
  { id: 7, name: "Hyun Jong", gender: "Male", affiliation: "Mount Hua Sect", height: "Average", firstSeenChapter: 5, aliases: ["Mount Hua Sect Leader"] },
  { id: 8, name: "Jin Geumryong", gender: "Male", affiliation: "Southern Edge Sect", height: "Tall", firstSeenChapter: 30, aliases: [] },
  { id: 9, name: "Hyun Young", gender: "Male", affiliation: "Mount Hua Sect", height: "Short", firstSeenChapter: 5, aliases: [] }, // Added more examples
  { id: 10, name: "Im Sobyeong", gender: "Male", affiliation: "Hao Clan", height: 'Average', firstSeenChapter: 70, aliases: ["King of the Green Forest"] }
];

// Function to find a character by name (case-insensitive)
const findCharacterByName = (name: string): Character | undefined => {
    const normalizedName = name.trim().toLowerCase();
    return availableCharacters.find(char => char.name.toLowerCase() === normalizedName);
}

// Function to dynamically compare guessed character to the answer
const compareCharacters = (guess: Character, answer: Character): GuessComparison => {
    // Height comparison logic (remains the same)
    const heightOrder = { 'Short': 1, 'Average': 2, 'Tall': 3, 'Unknown': 0 };
    let heightResult: GuessComparison['height'] = 'incorrect';
    if (guess.height === answer.height) {
        heightResult = 'correct';
    } else if (heightOrder[guess.height] > 0 && heightOrder[answer.height] > 0) { // Only compare if both known
       if (heightOrder[guess.height] > heightOrder[answer.height]) {
           heightResult = 'lower';
       } else if (heightOrder[guess.height] < heightOrder[answer.height]) {
           heightResult = 'higher';
       }
    }

    // *** UPDATED ALIAS LOGIC ***
    let aliasResult: GuessComparison['aliases'] = 'incorrect';
    // Create sets of lowercase aliases for efficient comparison, ignore empty strings
    const answerAliasSet = new Set(answer.aliases.map(a => a.toLowerCase()).filter(Boolean));
    const guessAliasSet = new Set(guess.aliases.map(a => a.toLowerCase()).filter(Boolean));

    if (answerAliasSet.size === 0 && guessAliasSet.size === 0) {
        // Both have no aliases (correct)
        aliasResult = 'correct';
    } else if (answerAliasSet.size === guessAliasSet.size && [...guessAliasSet].every(alias => answerAliasSet.has(alias))) {
        // Sets are identical in content (correct)
        aliasResult = 'correct';
    } else {
        // Check for partial match (any overlap)
        let partialMatchFound = false;
        for (const guessAlias of guessAliasSet) {
            if (answerAliasSet.has(guessAlias)) {
                partialMatchFound = true;
                break; // Found one match, no need to check further
            }
        }
        if (partialMatchFound) {
            aliasResult = 'partial'; // At least one alias matches
        }
        // Otherwise, it remains 'incorrect'
    }


    return {
        name: guess.name === answer.name ? 'correct' : 'incorrect',
        gender: guess.gender === answer.gender ? 'correct' : 'incorrect',
        affiliation: guess.affiliation === answer.affiliation ? 'correct' : 'incorrect',
        height: heightResult,
        firstSeenChapter: guess.firstSeenChapter === answer.firstSeenChapter
            ? 'correct'
            : guess.firstSeenChapter > answer.firstSeenChapter
                ? 'later'
                : 'earlier',
        aliases: aliasResult, // Use the updated result
    };
}
// --- App Component ---

function App() {
  const [guess, setGuess] = useState(""); // Current value in the input field
  const [guessCount, setGuessCount] = useState(0); // Number of guesses made
  const [guesses, setGuesses] = useState<GuessResult[]>([]); // Store list of past guess results
  const [message, setMessage] = useState<string>("");
  const [isGameOver, setIsGameOver] = useState<boolean>(false);
  const guessedCharacterIds = guesses.map(g => g.guessedCharacter.id);

  // Handler to update the guess state in App based on InputForm changes
  const handleGuessValueChange = (value: string) => {
    setGuess(value);
    setMessage(""); // Clear message on input change
  };

  // Handler for form submission
  const handleSubmit = (event: React.FormEvent) => {
     event.preventDefault();
     if (isGameOver) return; // Don't allow submissions if game is over
     setMessage(""); // Clear previous messages

     const guessedChar = findCharacterByName(guess); // Find character from our available list

     // Handle case where character is not found
     if (!guessedChar) {
       setMessage(`Character "${guess}" not found in the list.`);
       setGuess(""); // Clear invalid guess from input
       return;
     }

     // Prevent guessing the same character twice
     if (guesses.some(g => g.guessedCharacter.id === guessedChar.id)) {
         setMessage(`You already guessed ${guessedChar.name}.`);
         setGuess(""); // Clear the input after duplicate attempt
         return;
     }

     // Perform the comparison using our dedicated function
     const comparisonResult = compareCharacters(guessedChar, correctAnswer);

     // Create the result object to add to the list
     const resultToAdd: GuessResult = {
         guessedCharacter: guessedChar,
         comparison: comparisonResult,
     };

     // Add the new guess result to the beginning of the list (optional, shows newest first)
     setGuesses(prevGuesses => [resultToAdd, ...prevGuesses]);
     setGuessCount(prevCount => prevCount + 1); // Increment guess count
     // Check for win condition
     if (guessedChar.id === correctAnswer.id) {
        if(guessCount === 0) {
         setMessage(`Correct! You guessed ${correctAnswer.name} in one try!`);
        }
        else {
            setMessage(`Correct! You guessed ${correctAnswer.name} in ${guessCount + 1} tries!`);
        }
         setIsGameOver(true); // End the game
     }
     // Optional: Add message for incorrect guess
     // else {
     //    setMessage(`${guessedChar.name} is incorrect. Keep trying!`);
     // }



     setGuess(""); // Clear input field after submission
   };

  // Determine message styling based on game state and message content
  const messageClass = `
    text-center font-bold mb-4 min-h-[1.2em] px-2 text-sm sm:text-base
    ${isGameOver ? 'text-green-600' : (message ? (message.includes("not found") || message.includes("already guessed") ? 'text-yellow-600' : 'text-red-600') : '')}
  `; // Added yellow for warnings

  return (
    // Apply Tailwind classes for overall App layout and background
    <div className="min-h-screen bg-transparent py-8 px-4 font-sans flex justify-center items-center">
        {/* Centered container with max-width, padding, background, rounded corners, and shadow */}
        <div className="w-full max-w-2xl bg-white rounded-xl flex flex-col shadow-lg justify-center items-center">
            <img src="/header.png" alt="Logo" className="scale-[0.70]" />

            <InputForm
                guess={guess}
                onGuessChange={handleGuessValueChange}
                onSubmit={handleSubmit}
                availableCharacters={availableCharacters}
                guessedIds={guessedCharacterIds}
                disabled={isGameOver}
            />

            {/* Feedback Message with conditional Tailwind classes */}
            {message && <p className={messageClass.trim().replace(/\s+/g, ' ')}>{message}</p>}

            {/* Render the list of previous guesses */}
            <GuessResultsList guesses={guesses} />
        </div>
    </div>
  )
}

export default App;