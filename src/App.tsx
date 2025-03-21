import React, { useState } from 'react'
import './App.css'
import InputForm from './components/InputForm'

function App() {
  const [guess, setGuess] = useState("");
  const [result, setResult] = useState("");
  const handleGuessChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setGuess(event.target.value);
};
  const answer: string = "42";
  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (guess === answer) {
        console.log("Correct!");
    } else {
        console.log("Incorrect, try again.");
    }
};
  return (
    <>
      <InputForm 
        guess={guess}
        onGuessChange={handleGuessChange}
        onSubmit={handleSubmit}
      />
    </>
  )
}

export default App
