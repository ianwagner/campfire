import React from 'react';
import { motion } from 'framer-motion';

/**
 * Animated logo component. The animation between the "open" and "closed"
 * states will be implemented with Framer Motion.
 *
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the sidebar is open.
 */
const Logo = ({ isOpen }) => {
  return (
    <motion.div
      className="h-16 flex items-center justify-center"
      animate={isOpen ? 'open' : 'closed'}
    >
      {/* TODO: Replace with actual animated logo markup */}
      <div className="text-2xl font-bold">Campfire</div>
    </motion.div>
  );
};

export default Logo;
