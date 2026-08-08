import React from 'react';
import { 
  VscJson, 
  VscMarkdown, 
  VscFileCode, 
  VscFileMedia,
  VscTerminal,
  VscSymbolVariable
} from 'react-icons/vsc';
import { FaHtml5, FaCss3Alt, FaJs, FaReact, FaPython, FaRust, FaGolang } from 'react-icons/fa6';
import { SiTypescript } from 'react-icons/si';

interface FileIconProps {
  filename: string;
  size?: number;
  className?: string;
}

export function FileIcon({ filename, size = 16, className = "" }: FileIconProps) {
  const name = filename.toLowerCase();
  
  if (name.endsWith('.json')) return <VscJson size={size} className={`text-yellow-400 ${className}`} />;
  if (name.endsWith('.md')) return <VscMarkdown size={size} className={`text-blue-300 ${className}`} />;
  if (name.endsWith('.ts')) return <SiTypescript size={size} className={`text-blue-500 ${className}`} />;
  if (name.endsWith('.tsx')) return <FaReact size={size} className={`text-blue-400 ${className}`} />;
  if (name.endsWith('.js')) return <FaJs size={size} className={`text-yellow-300 ${className}`} />;
  if (name.endsWith('.jsx')) return <FaReact size={size} className={`text-blue-400 ${className}`} />;
  if (name.endsWith('.html')) return <FaHtml5 size={size} className={`text-orange-500 ${className}`} />;
  if (name.endsWith('.css')) return <FaCss3Alt size={size} className={`text-blue-500 ${className}`} />;
  if (name.endsWith('.py')) return <FaPython size={size} className={`text-blue-500 ${className}`} />;
  if (name.endsWith('.rs')) return <FaRust size={size} className={`text-orange-400 ${className}`} />;
  if (name.endsWith('.go')) return <FaGolang size={size} className={`text-blue-300 ${className}`} />;
  if (name.endsWith('.sh') || name.endsWith('.bat')) return <VscTerminal size={size} className={`text-green-400 ${className}`} />;
  if (name.endsWith('.env')) return <VscSymbolVariable size={size} className={`text-gray-300 ${className}`} />;
  if (name.match(/\.(png|jpe?g|gif|svg|webp)$/)) return <VscFileMedia size={size} className={`text-purple-400 ${className}`} />;
  
  return <VscFileCode size={size} className={`text-gray-400 ${className}`} />;
}
