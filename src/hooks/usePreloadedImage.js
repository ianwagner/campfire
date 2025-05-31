import { useEffect, useRef, useState } from 'react';

export default function usePreloadedImage(src) {
  const [current, setCurrent] = useState(src);
  const prev = useRef(src);

  useEffect(() => {
    if (!src || src === prev.current) return;
    let active = true;
    const img = new Image();
    img.onload = () => {
      if (active) {
        prev.current = src;
        setCurrent(src);
      }
    };
    img.src = src;
    return () => {
      active = false;
    };
  }, [src]);

  return current;
}
