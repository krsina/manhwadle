import React, { useState } from 'react';

interface InputFormProps {
    guess: string;
    onGuessChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    onSubmit: (event: React.FormEvent) => void;
}

const InputForm: React.FC<InputFormProps> = ({ guess, onGuessChange, onSubmit }) => {
    return (
        <form>
            <input type="text" name="guess" value={guess} onChange={onGuessChange} placeholder="Enter your guess!" />
            <button type="button" onClick={onSubmit}>Submit</button>
        </form>
    );
}

export default InputForm;