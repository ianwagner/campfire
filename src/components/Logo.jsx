import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';

const Logo = ({ isOpen }) => {
  const wrapperRef = useRef(null);

  useEffect(() => {
    const letters = Array.from(wrapperRef.current.querySelectorAll("svg[id^='letter-']")).reverse();
    const rect = wrapperRef.current.querySelector("svg > rect");

    const condensedTargets = [
      { x: 84, y: -4 },
      { x: 89, y: -4 },
      { x: 96, y: -4 },
      { x: 7, y: 28 },
      { x: 13, y: 28 },
      { x: 20, y: 28 },
      { x: -96, y: 60 },
      { x: -89, y: 60 },
      { x: -84, y: 60 },
    ];

    const baseYOffset = 28;

    // Animate letters
    gsap.to(letters, {
      x: (i) => isOpen ? 0 : condensedTargets[i].x,
      y: (i) => isOpen ? baseYOffset : condensedTargets[i].y,
      rotation: () => isOpen ? 0 : gsap.utils.random(-2, 2),
      duration: 0.6,
      ease: "power3.inOut",
    });

    // Animate background rect
    const openWidth = 140;
    const openHeight = 24;
    const condensedSize = 50;
    const centerX = openWidth / 2;
    const centerY = openHeight / 2;

    if (rect) {
      gsap.to(rect, {
        attr: isOpen
          ? {
              width: openWidth,
              height: openHeight,
              rx: 12,
              x: 0,
              y: 0,
            }
          : {
              width: condensedSize,
              height: condensedSize,
              rx: 12,
              x: centerX - condensedSize / 2,
              y: centerY - condensedSize / 2,
            },
        duration: 0.6,
        ease: "power2.inOut",
      });
    }
  }, [isOpen]);

  return (
    <div className="logo-wrapper h-20 w-[300px] relative mx-auto" ref={wrapperRef}>
      {/* Drop your logo SVG block here exactly as you had it */}
    </div>
  );
};

export default Logo;
