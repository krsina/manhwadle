import React from 'react';
import { GuessResult } from '../types';
import AttributeCard from './AttributeCard';

// 1. Add 'formatHeight' to the component's props interface
interface GuessRowProps {
  guessResult: GuessResult;
  isNewest: boolean;
  formatHeight: (inches: number) => string;
}

// 2. Destructure 'formatHeight' from the props
const GuessRow: React.FC<GuessRowProps> = ({ guessResult, isNewest, formatHeight }) => {
  const { guessedCharacter, comparison } = guessResult;

  const rowClasses = `
    flex items-stretch
    mb-2 bg-gray-50 rounded-lg shadow-sm p-1
  `;

  // 3. Use the function to prepare the display text before creating the array
  const heightText = `${formatHeight(guessedCharacter.height)}${
    comparison.height === 'higher' ? ' ↑' : comparison.height === 'lower' ? ' ↓' : ''
  }`;

  const firstSeenText = `Ch. ${guessedCharacter.firstSeenChapter}${
    comparison.firstSeenChapter === 'earlier' ? ' ↑' : comparison.firstSeenChapter === 'later' ? ' ↓' : ''
  }`;

  const aliasText = guessedCharacter.aliases.join(', ') || 'None';

  // 4. Update the attributes array with the newly formatted text
  const attributes = [
      { name: "Character", value: guessedCharacter.name, result: comparison.name },
      { name: "Gender", value: guessedCharacter.gender, result: comparison.gender },
      { name: "Affiliation", value: guessedCharacter.affiliation, result: comparison.affiliation },
      { name: "Height", value: heightText, result: comparison.height },
      { name: "First Seen", value: firstSeenText, result: comparison.firstSeenChapter },
      { name: "Aliases", value: aliasText, result: comparison.aliases },
  ];

  return (
    <div className={rowClasses.trim().replace(/\s+/g, ' ')}>
      {attributes.map((attr, index) => (
          <AttributeCard
              key={attr.name}
              attributeName={attr.name}
              value={attr.value}
              result={attr.result}
              index={index}
              isNewest={isNewest}
          />
      ))}
    </div>
  );
};

export default GuessRow;