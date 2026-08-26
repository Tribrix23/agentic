import React from 'react';
import { FaPython } from 'react-icons/fa';

export const PythonLogo: React.FC<{ className?: string }> = ({ className }) => (
  <FaPython className={className} />
);
