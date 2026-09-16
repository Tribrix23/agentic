import React, { useState } from 'react';
import { Loader2, Search, Book, Star, GitBranch, GitPullRequest, CircleDot, AlertCircle, Users, Check, Inbox, Building, MapPin, Link2 } from 'lucide-react';
import { SiGithub } from 'react-icons/si';

interface GithubPreviewProps {
  toolName: string;
  args: any;
  output: string;
  isRunning: boolean;
  isError: boolean;
}

export function GithubPreview({ toolName, args, output, isRunning, isError }: GithubPreviewProps) {
  const isSearchUsers = toolName.includes('search_users');
  const isSearchRepos = toolName.includes('search_repositories') || toolName.includes('search_repos');
  
  let data: any = null;
  if (output && !isError) {
    try {
      data = JSON.parse(output);
    } catch (e) {
      // Not JSON
    }
  }

  const renderSkeleton = () => (
    <div className="w-full bg-white text-[#24292f] font-sans border border-[#d0d7de] rounded-lg overflow-hidden animate-pulse shadow-sm">
      {/* Header Skeleton */}
      <div className="flex items-center gap-4 px-4 py-3 bg-[#f6f8fa] border-b border-[#d0d7de]">
        <div className="w-8 h-8 bg-[#e1e4e8] rounded-full"></div>
        <div className="w-64 h-8 bg-[#e1e4e8] rounded-md"></div>
      </div>
      
      {/* Body Skeleton */}
      <div className="flex p-4 gap-6 min-h-[400px]">
        {/* Sidebar */}
        <div className="w-1/4 space-y-4">
          <div className="h-4 bg-[#e1e4e8] rounded w-20"></div>
          <div className="space-y-2">
            {[1,2,3,4,5].map(i => <div key={i} className="h-8 bg-[#e1e4e8] rounded w-full"></div>)}
          </div>
        </div>
        {/* Main */}
        <div className="flex-1 space-y-4">
          <div className="h-6 bg-[#e1e4e8] rounded w-32"></div>
          <div className="space-y-4">
            {[1,2,3].map(i => (
              <div key={i} className="p-4 border border-[#d0d7de] rounded-md space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#e1e4e8] rounded-full"></div>
                  <div className="h-4 bg-[#e1e4e8] rounded w-32"></div>
                </div>
                <div className="h-3 bg-[#e1e4e8] rounded w-full"></div>
                <div className="h-3 bg-[#e1e4e8] rounded w-2/3"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  if (isRunning && !output) {
    return renderSkeleton();
  }
  
  if (isError || !data) {
    return (
      <div className="p-4 bg-white text-[#24292f] border border-[#d0d7de] rounded-lg font-mono text-sm overflow-x-auto whitespace-pre-wrap shadow-sm">
        {output || 'No output'}
      </div>
    );
  }

  // Common Header
  const renderHeader = (query: string) => (
    <div className="flex items-center gap-4 px-4 py-3 bg-[#f6f8fa] border-b border-[#d0d7de]">
      <SiGithub className="w-8 h-8 text-[#24292f]" />
      <div className="flex-1 max-w-xl relative">
        <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
          <Search size={14} className="text-[#57606a]" />
        </div>
        <input 
          type="text" 
          value={query} 
          readOnly 
          className="block w-full bg-white border border-[#d0d7de] rounded-md py-1 pl-8 pr-3 text-sm text-[#24292f] focus:outline-none focus:border-[#0969da] focus:ring-1 focus:ring-[#0969da]"
        />
      </div>
    </div>
  );

  const query = args.q || args.query || '';
  const totalCount = data.total_count || (data.items ? data.items.length : 0);

  if (isSearchUsers || isSearchRepos) {
    return (
      <div className="w-full bg-white text-[#24292f] font-sans border border-[#d0d7de] rounded-lg overflow-hidden shadow-sm text-[14px]">
        {renderHeader(query)}
        <div className="flex flex-col md:flex-row min-h-[400px]">
          {/* Sidebar */}
          <div className="w-full md:w-64 border-r border-[#d0d7de] p-4 bg-white">
            <h3 className="font-semibold text-[#24292f] mb-2 text-sm">Filter by</h3>
            <ul className="space-y-1">
              <li className={`flex items-center justify-between p-2 rounded-md cursor-pointer text-sm ${isSearchRepos ? 'bg-[#0969da]/10 text-[#0969da] border-l-2 border-[#0969da] font-medium' : 'hover:bg-[#f3f4f6]'}`}>
                <span className="flex items-center gap-2"><Book size={14} className={isSearchRepos ? 'text-[#0969da]' : 'text-[#57606a]'}/> Repositories</span>
                {isSearchRepos && <span className="bg-[#0969da]/10 text-[#0969da] px-2 py-0.5 rounded-full text-xs">{totalCount}</span>}
              </li>
              <li className="flex items-center justify-between p-2 rounded-md hover:bg-[#f3f4f6] cursor-pointer text-sm">
                <span className="flex items-center gap-2"><CircleDot size={14} className="text-[#57606a]"/> Issues</span>
              </li>
              <li className={`flex items-center justify-between p-2 rounded-md cursor-pointer text-sm ${isSearchUsers ? 'bg-[#0969da]/10 text-[#0969da] border-l-2 border-[#0969da] font-medium' : 'hover:bg-[#f3f4f6]'}`}>
                <span className="flex items-center gap-2"><Users size={14} className={isSearchUsers ? 'text-[#0969da]' : 'text-[#57606a]'}/> Users</span>
                {isSearchUsers && <span className="bg-[#0969da]/10 text-[#0969da] px-2 py-0.5 rounded-full text-xs">{totalCount}</span>}
              </li>
            </ul>
          </div>
          
          {/* Main Content */}
          <div className="flex-1 p-6 bg-white">
            <div className="flex justify-between items-center mb-4 border-b border-[#d0d7de] pb-4">
              <h2 className="text-xl font-semibold text-[#24292f]">{totalCount.toLocaleString()} {isSearchUsers ? 'users' : 'repositories'}</h2>
            </div>
            
            <div className="space-y-4">
              {!data.items || data.items.length === 0 ? (
                <div className="text-center py-10 text-[#57606a]">We couldn't find any {isSearchUsers ? 'users' : 'repositories'} matching '{query}'</div>
              ) : isSearchUsers ? (
                data.items.map((user: any, i: number) => (
                  <div key={i} className="flex items-start gap-4 p-4 border border-[#d0d7de] rounded-md hover:bg-[#f6f8fa] transition-colors">
                    <img src={user.avatar_url} alt={user.login} className="w-10 h-10 rounded-full border border-[#d0d7de]" />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <a href={user.html_url} target="_blank" rel="noreferrer" className="text-[#0969da] hover:underline font-semibold text-base">{user.login}</a>
                        <button className="px-3 py-1 bg-[#f6f8fa] border border-[#d0d7de] rounded-md text-xs font-medium hover:bg-[#f3f4f6] text-[#24292f] transition-colors">Follow</button>
                      </div>
                      {user.bio && <p className="text-sm mt-1 text-[#57606a]">{user.bio}</p>}
                      <div className="flex items-center gap-4 mt-2 text-xs text-[#57606a]">
                        <span className="flex items-center gap-1"><Building size={12}/> ID: {user.id}</span>
                        <a href={user.html_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-[#0969da]"><Link2 size={12}/> Profile</a>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                data.items.map((repo: any, i: number) => (
                  <div key={i} className="flex items-start gap-4 p-4 border border-[#d0d7de] rounded-md hover:bg-[#f6f8fa] transition-colors">
                    <Book className="w-5 h-5 text-[#57606a] mt-0.5" />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <a href={repo.html_url} target="_blank" rel="noreferrer" className="text-[#0969da] hover:underline font-semibold text-base break-all">{repo.full_name}</a>
                        <button className="px-3 py-1 bg-[#f6f8fa] border border-[#d0d7de] rounded-md text-xs font-medium hover:bg-[#f3f4f6] flex items-center gap-1 text-[#24292f] transition-colors"><Star size={14}/> Star</button>
                      </div>
                      {repo.description && <p className="text-sm mt-1 text-[#24292f]">{repo.description}</p>}
                      <div className="flex items-center gap-4 mt-3 text-xs text-[#57606a]">
                        {repo.language && (
                          <span className="flex items-center gap-1">
                            <span className="w-2.5 h-2.5 rounded-full bg-[#f1e05a]"></span>
                            {repo.language}
                          </span>
                        )}
                        <span className="flex items-center gap-1 hover:text-[#0969da] cursor-pointer"><Star size={14}/> {repo.stargazers_count?.toLocaleString() || 0}</span>
                        {repo.updated_at && <span>Updated {new Date(repo.updated_at).toLocaleDateString()}</span>}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Fallback for other github tools
  return (
    <div className="w-full bg-white text-[#24292f] border border-[#d0d7de] rounded-lg overflow-hidden shadow-sm text-[13px]">
      {renderHeader(toolName.replace('mcp_github_', '').replace('mcp__github__', '').replace(/_/g, ' '))}
      <div className="p-4 overflow-x-auto">
        <pre className="font-mono text-xs">{JSON.stringify(data, null, 2)}</pre>
      </div>
    </div>
  );
}
