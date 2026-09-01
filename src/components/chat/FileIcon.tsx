import React from 'react';
import { 
  VscJson, 
  VscMarkdown, 
  VscFileCode, 
  VscFileMedia,
  VscTerminal,
  VscSymbolVariable
} from 'react-icons/vsc';
import { FaHtml5, FaCss3Alt, FaJs, FaReact, FaRust, FaGolang, FaJava, FaPhp } from 'react-icons/fa6';
import { SiTypescript, SiCplusplus, SiSharp, SiRuby, SiSwift, SiKotlin, SiDart, SiLua, SiScala, SiHaskell, SiZig, SiVuedotjs, SiSvelte, SiToml, SiYaml, SiDocker, SiAssemblyscript } from 'react-icons/si';

const PythonIcon = ({ size, className }: { size: number, className?: string }) => (
  <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 448 512" height={size} width={size} className={className} xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="python-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="50%" stopColor="#3776AB" />
        <stop offset="50%" stopColor="#FFD43B" />
      </linearGradient>
    </defs>
    <path fill="url(#python-grad)" d="M439.8 200.5c-7.7-30.9-22.3-54.2-53.4-54.2h-40.1v47.4c0 36.8-31.2 67.8-66.8 67.8H172.7c-29.2 0-53.4 25-53.4 54.3v101.8c0 29 25.2 46 53.4 54.3 33.8 9.9 66.3 11.7 106.8 0 26.9-7.8 53.4-23.5 53.4-54.3v-40.7H226.2v-13.6h160.2c31.1 0 42.6-21.7 53.4-54.2 11.2-33.5 10.7-65.7 0-108.6zM286.2 404c11.1 0 20.1 9.1 20.1 20.3 0 11.3-9 20.4-20.1 20.4-11 0-20.1-9.2-20.1-20.4.1-11.3 9.1-20.3 20.1-20.3zM167.8 248.1h106.8c29.7 0 53.4-24.5 53.4-54.3V91.9c0-29-24.4-50.7-53.4-55.6-35.8-5.9-74.7-5.6-106.8.1-45.2 8-53.4 24.7-53.4 55.6v40.7h106.9v13.6h-147c-31.1 0-58.3 18.7-66.8 54.2-9.8 40.7-10.2 66.1 0 108.6 7.6 31.6 25.7 54.2 56.8 54.2H101v-48.8c0-35.3 30.5-66.4 66.8-66.4zm-6.7-142.6c-11.1 0-20.1-9.1-20.1-20.3.1-11.3 9-20.4 20.1-20.4 11 0 20.1 9.2 20.1 20.4s-9 20.3-20.1 20.3z"></path>
  </svg>
);

interface FileIconProps {
  filename: string;
  size?: number;
  className?: string;
}

export function FileIcon({ filename, size = 16, className = "" }: FileIconProps) {
  const name = filename.toLowerCase().replace(' (working tree)', '');
  
  // Web
  if (name.endsWith('.html') || name.endsWith('.htm')) return <FaHtml5 size={size} className={`text-orange-500 ${className}`} />;
  if (name.endsWith('.css')) return <FaCss3Alt size={size} className={`text-blue-500 ${className}`} />;
  if (name.endsWith('.vue')) return <SiVuedotjs size={size} className={`text-emerald-400 ${className}`} />;
  if (name.endsWith('.svelte')) return <SiSvelte size={size} className={`text-orange-500 ${className}`} />;

  // JavaScript / TypeScript
  if (name.endsWith('.tsx')) return <FaReact size={size} className={`text-blue-400 ${className}`} />;
  if (name.endsWith('.jsx')) return <FaReact size={size} className={`text-blue-400 ${className}`} />;
  if (name.endsWith('.ts')) return <SiTypescript size={size} className={`text-blue-500 ${className}`} />;
  if (name.endsWith('.js') || name.endsWith('.mjs') || name.endsWith('.cjs')) return <FaJs size={size} className={`text-yellow-300 ${className}`} />;

  // Systems
  if (name.endsWith('.rs')) return <FaRust size={size} className={`text-blue-400 ${className}`} />;
  if (name.endsWith('.go')) return <FaGolang size={size} className={`text-blue-300 ${className}`} />;
  if (name.endsWith('.zig')) return <SiZig size={size} className={`text-yellow-400 ${className}`} />;
  if (name.endsWith('.cpp') || name.endsWith('.cc') || name.endsWith('.cxx') || name.endsWith('.hpp')) return <SiCplusplus size={size} className={`text-blue-500 ${className}`} />;
  if (name.endsWith('.c') || name.endsWith('.h')) return <SiCplusplus size={size} className={`text-blue-400 ${className}`} />;
  if (name.endsWith('.asm') || name.endsWith('.s')) return <SiAssemblyscript size={size} className={`text-blue-500 ${className}`} />;

  // JVM
  if (name.endsWith('.java')) return <FaJava size={size} className={`text-orange-400 ${className}`} />;
  if (name.endsWith('.kt') || name.endsWith('.kts')) return <SiKotlin size={size} className={`text-purple-400 ${className}`} />;
  if (name.endsWith('.scala')) return <SiScala size={size} className={`text-red-500 ${className}`} />;

  // Scripting
  if (name.endsWith('.py') || name.endsWith('.pyw')) return <PythonIcon size={size} className={className} />;
  if (name.endsWith('.rb')) return <SiRuby size={size} className={`text-red-500 ${className}`} />;
  if (name.endsWith('.php')) return <FaPhp size={size} className={`text-indigo-400 ${className}`} />;
  if (name.endsWith('.lua')) return <SiLua size={size} className={`text-blue-400 ${className}`} />;

  // Mobile
  if (name.endsWith('.swift')) return <SiSwift size={size} className={`text-orange-500 ${className}`} />;
  if (name.endsWith('.dart')) return <SiDart size={size} className={`text-blue-400 ${className}`} />;

  // Functional
  if (name.endsWith('.hs') || name.endsWith('.lhs')) return <SiHaskell size={size} className={`text-purple-400 ${className}`} />;
  if (name.endsWith('.cs')) return <SiSharp size={size} className={`text-purple-500 ${className}`} />;

  // Config / Data
  if (name.endsWith('.json')) return <VscJson size={size} className={`text-yellow-400 ${className}`} />;
  if (name.endsWith('.toml')) return <SiToml size={size} className={`text-orange-400 ${className}`} />;
  if (name.endsWith('.yaml') || name.endsWith('.yml')) return <SiYaml size={size} className={`text-red-400 ${className}`} />;
  if (name.endsWith('.md') || name.endsWith('.mdx')) return <VscMarkdown size={size} className={`text-blue-300 ${className}`} />;
  if (name === 'dockerfile' || name.endsWith('.dockerfile')) return <SiDocker size={size} className={`text-blue-400 ${className}`} />;
  if (name.endsWith('.env')) return <VscSymbolVariable size={size} className={`text-gray-300 ${className}`} />;

  // Shell / Executable
  if (name.endsWith('.sh') || name.endsWith('.bash') || name.endsWith('.zsh') || name.endsWith('.bat') || name.endsWith('.ps1') || name.endsWith('.exe')) return <VscTerminal size={size} className={`text-green-400 ${className}`} />;

  // Media
  if (name.match(/\.(png|jpe?g|gif|svg|webp|ico|bmp|mp4|webm|mkv|avi|mov)$/)) return <VscFileMedia size={size} className={`text-purple-400 ${className}`} />;
  
  return <VscFileCode size={size} className={`text-gray-400 ${className}`} />;
}
