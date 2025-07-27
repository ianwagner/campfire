import React from 'react';

const PageToolbar = ({ left, right }) => (
  <div className="flex items-center mb-4 flex-wrap md:flex-nowrap gap-2">
    <div className="flex flex-wrap md:flex-nowrap items-center gap-2">{left}</div>
    <div className="flex-1" />
    <div className="flex flex-wrap md:flex-nowrap items-center gap-2 justify-end">{right}</div>
  </div>
);

export default PageToolbar;
