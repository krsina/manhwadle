import React from 'react';
import { GuessResult } from '../types';
import AttributeCard from './AttributeCard';

interface GuessRowProps {
  guessResult: GuessResult;
  isNewest: boolean;
}

const GuessRow: React.FC<GuessRowProps> = ({ guessResult, isNewest }) => {
  const { guessedCharacter, comparison } = guessResult;

  const rowClasses = `
    flex items-stretch
    mb-2 bg-gray-50 rounded-lg shadow-sm p-1
  `;

  const nameCellClasses = `
    flex items-center justify-center font-bold p-1 mx-1 /* Reduced padding slightly */
    border border-gray-300 rounded-md bg-gray-200
    text-center text-sm sm:text-base
    flex-1 basis-0 min-w-[100px] /* Match first header */
  `;

  const attributes = [
      { name: "Gender", value: guessedCharacter.gender, result: comparison.gender },
      { name: "Affiliation", value: guessedCharacter.affiliation, result: comparison.affiliation },
      { name: "Height", value: guessedCharacter.height, result: comparison.height },
      { name: "First Seen", value: `Ch. ${guessedCharacter.firstSeenChapter}`, result: comparison.firstSeenChapter },
      { name: "Aliases", value: guessedCharacter.aliases, result: comparison.aliases },
  ];

  return (
    <div className={rowClasses.trim().replace(/\s+/g, ' ')}>
      {/* Character Name Cell */}
      <div className={nameCellClasses.trim().replace(/\s+/g, ' ')}>
          {guessedCharacter.name}
      </div>
      {/* Attribute Cards - will inherit flex sizing from their own classes */}
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