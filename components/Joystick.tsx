import React, { useRef, useEffect, useState } from 'react';

interface JoystickProps {
  onMove: (dx: number, dy: number) => void;
}

const Joystick: React.FC<JoystickProps> = ({ onMove }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 }); // Joystick head position
  const [origin, setOrigin] = useState({ x: 0, y: 0 }); // Where touch started

  // Configuration
  const MAX_RADIUS = 50;

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    // Set origin to where user touched relative to container
    // But for a fixed zone joystick, we might want to center it on the touch
    // or keep it static. Let's make it static bottom-left/right or dynamic.
    // Let's go with: Dynamic Origin.
    
    setOrigin({ x: touch.clientX, y: touch.clientY });
    setPosition({ x: 0, y: 0 });
    setActive(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!active) return;
    const touch = e.touches[0];

    const dx = touch.clientX - origin.x;
    const dy = touch.clientY - origin.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    let moveX = dx;
    let moveY = dy;

    // Clamp within radius
    if (distance > MAX_RADIUS) {
      const angle = Math.atan2(dy, dx);
      moveX = Math.cos(angle) * MAX_RADIUS;
      moveY = Math.sin(angle) * MAX_RADIUS;
    }

    setPosition({ x: moveX, y: moveY });
    
    // Normalize output -1 to 1
    onMove(moveX / MAX_RADIUS, moveY / MAX_RADIUS);
  };

  const handleTouchEnd = () => {
    setActive(false);
    setPosition({ x: 0, y: 0 });
    onMove(0, 0);
  };

  return (
    <div 
      ref={containerRef}
      className="fixed bottom-0 left-0 w-full h-1/2 z-50 touch-none"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {active && (
        <div 
          className="absolute w-24 h-24 rounded-full border-2 border-white/30 bg-black/20 backdrop-blur-sm pointer-events-none transform -translate-x-1/2 -translate-y-1/2"
          style={{ 
            left: origin.x, 
            top: origin.y 
          }}
        >
          <div 
            className="absolute w-10 h-10 rounded-full bg-white/80 shadow-lg top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"
            style={{ 
              transform: `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px))`
            }}
          />
        </div>
      )}
      {!active && (
         <div className="absolute bottom-10 left-1/2 transform -translate-x-1/2 text-white/30 text-sm font-mono pointer-events-none animate-pulse">
           TOUCH TO MOVE
         </div>
      )}
    </div>
  );
};

export default Joystick;
