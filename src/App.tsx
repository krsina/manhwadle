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
// THIS IS WHERE YOUR CORE GAME LOGIC GOES - REPLACE PLACEHOLDERS
const compareCharacters = (guess: Character, answer: Character): GuessComparison => {
    // Height comparison logic (example assumes ordered Short < Average < Tall)
    const heightOrder = { 'Short': 1, 'Average': 2, 'Tall': 3, 'Unknown': 0 };
    let heightResult: GuessComparison['height'] = 'incorrect';
    if (guess.height === answer.height) {
        heightResult = 'correct';
    } else if (heightOrder[guess.height] > heightOrder[answer.height]) {
        heightResult = 'lower'; // Guessed character is taller (lower on list if sorted short->tall)
    } else if (heightOrder[guess.height] < heightOrder[answer.height]) {
        heightResult = 'higher'; // Guessed character is shorter (higher on list if sorted short->tall)
    }
    // Handle Unknown cases if necessary - currently 'incorrect' if different

    // Alias comparison logic (example: partial if any alias matches)
    let aliasResult: GuessComparison['aliases'] = 'incorrect';
    const answerAliasesLower = answer.aliases.map(a => a.toLowerCase());
    const guessAliasesLower = guess.aliases.map(a => a.toLowerCase());
    const matchingAliases = guessAliasesLower.filter(alias => answerAliasesLower.includes(alias));

    if (guessAliasesLower.length === answerAliasesLower.length && matchingAliases.length === guessAliasesLower.length) {
         // Consider order? For now, exact match of sets.
         if (guessAliasesLower.every((alias, index) => alias === answerAliasesLower[index])) {
             aliasResult = 'correct'; // Perfect match including order (if desired)
         } else if (new Set(guessAliasesLower).size === new Set(answerAliasesLower).size && matchingAliases.length === guessAliasesLower.length) {
              aliasResult = 'correct'; // Same aliases, potentially different order
         } else if (matchingAliases.length > 0) {
             aliasResult = 'partial'; // Some overlap but not identical sets
         }
    }
     else if (matchingAliases.length > 0) {
        aliasResult = 'partial';
    }
     else if (guessAliasesLower.length === 0 && answerAliasesLower.length === 0) {
         aliasResult = 'correct'; // Both have no aliases
     }


    return {
        gender: guess.gender === answer.gender ? 'correct' : 'incorrect',
        affiliation: guess.affiliation === answer.affiliation ? 'correct' : 'incorrect',
        height: heightResult,
        firstSeenChapter: guess.firstSeenChapter === answer.firstSeenChapter
            ? 'correct'
            : guess.firstSeenChapter > answer.firstSeenChapter
                ? 'later' // Guessed character appeared later (higher chapter number)
                : 'earlier', // Guessed character appeared earlier (lower chapter number)
        aliases: aliasResult,
    };
}

// --- App Component ---

function App() {
  const [guess, setGuess] = useState(""); // Current value in the input field
  const [guesses, setGuesses] = useState<GuessResult[]>([]); // Store list of past guess results
  const [message, setMessage] = useState<string>("");
  const [isGameOver, setIsGameOver] = useState<boolean>(false);

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

     // Check for win condition
     if (guessedChar.id === correctAnswer.id) {
         setMessage(`Correct! You guessed ${correctAnswer.name}!`);
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
    <div className="min-h-screen bg-gray-100 py-8 px-4 font-sans flex justify-center">
        {/* Centered container with max-width, padding, background, rounded corners, and shadow */}
        <div className="w-full max-w-5xl p-4 sm:p-6 bg-white rounded-xl shadow-lg">
            {/* Heading with Tailwind classes */}
            <h1 className="text-center text-2xl sm:text-3xl font-bold text-purple-800 mb-6 sm:mb-8">
                Return of the Mount Hua Sect - Character Guessing Game
            </h1>

            {/* Render the Input Form component */}
            <InputForm
                guess={guess}
                onGuessChange={handleGuessValueChange}
                onSubmit={handleSubmit}
                availableCharacters={availableCharacters}
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