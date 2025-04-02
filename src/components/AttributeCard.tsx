import React, { useState, useEffect } from 'react';
import { AttributeResult } from '../types';

interface AttributeCardProps {
  attributeName: string;
  value: string | string[] | number;
  result: AttributeResult;
  index: number;
  isNewest: boolean;
}

const AttributeCard: React.FC<AttributeCardProps> = ({
    attributeName,
    value,
    result,
    index,
    isNewest,
}) => {
  const [isFlipped, setIsFlipped] = useState(!isNewest);

  useEffect(() => { /* ... */ }, [isNewest, index]);
  const getResultClasses = (): string => {
    switch (result) {
      case 'correct': return 'bg-green-600 border-green-700';
      case 'partial': case 'higher': case 'lower': case 'earlier': case 'later': return 'bg-orange-500 border-orange-700';
      case 'incorrect': default: return 'bg-red-600 border-red-700';
    }
  };
  const displayValue = Array.isArray(value) ? value.join(', ') || 'None' : value.toString();
  const titleValue = displayValue;
  let partialIndicator = '';
  if (result === 'higher' || result === 'later') partialIndicator = '⬆️';
  if (result === 'lower' || result === 'earlier') partialIndicator = '⬇️';

  // Card base styles:
  const cardBaseStyles = `
    relative border mx-1
    rounded-md text-center
    text-white h-[70px]
    box-border overflow-hidden
    [transform-style:preserve-3d]
    flex-1 basis-0      /* Allow grow/shrink */
    min-w-[70px]        /* Minimum width ~ square with h-[70px] */
  `;

   const transitionClasses = isNewest ? 'transition-transform duration-1000 ease-in-out' : '';
   const rotationClasses = isFlipped ? '[transform:rotateY(180deg)]' : '';
   const backgroundClasses = isFlipped ? getResultClasses() : (isNewest ? 'bg-gray-400 border-gray-500' : getResultClasses());
   const cardClasses = `${cardBaseStyles} ${transitionClasses} ${rotationClasses} ${backgroundClasses}`;
   const contentVisibilityAndTimingClasses = `
    transition-opacity duration-100 ease-in
    ${isFlipped ? `opacity-100 ${isNewest ? 'delay-300' : ''}` : 'opacity-0'}
   `;

  return (
    // Outer Card Div
    <div title={titleValue} className={cardClasses.trim().replace(/\s+/g, ' ')}>
      {/* Inner Rotator Div */}
      <div className={`w-full h-full ${isFlipped ? '[transform:rotateY(180deg)]' : ''}`}>
        {/* Content Visibility & Container Div */}
        <div className={`${contentVisibilityAndTimingClasses} w-full h-full`.trim().replace(/\s+/g, ' ')}>
          {/* Scrollable Area Div */}
          <div className="w-full h-full overflow-y-auto p-1 flex justify-center items-center">
              {/* Text Element */}
              <div className="font-semibold text-xs whitespace-normal break-words text-center">
                {displayValue}
                {partialIndicator && (
                   <span className="ml-1">{partialIndicator}</span>
                 )}
              </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AttributeCard;