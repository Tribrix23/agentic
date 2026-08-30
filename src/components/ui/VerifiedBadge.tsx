import React from 'react';

export const VerifiedBadge = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M22.5 12.536V11.464L20.25 8.214L20.661 4.339L16.893 3.518L14.25 0.75L12 1.946L9.75 0.75L7.107 3.518L3.339 4.339L3.75 8.214L1.5 11.464V12.536L3.75 15.786L3.339 19.661L7.107 20.482L9.75 23.25L12 22.054L14.25 23.25L16.893 20.482L20.661 19.661L20.25 15.786L22.5 12.536Z" fill="#0ea5e9"/>
    <path d="M7 12.5L10.5 16L17 8" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
