import React, { useState, useEffect } from 'react';
import { CheckCircle2, Circle, ListTodo, Clock, AlertCircle, ChevronDown, ChevronRight, Bot, Zap, Ban } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../App';
import { Task } from '../../lib/taskStore';
import { TaskGraph } from '../../lib/taskGraph';
import type { SubagentHandle } from '../../lib/agent/subagentTypes';

interface TodoListPanelProps {
  tasks: Task[];
  subagents?: SubagentHandle[];
  onTaskClick?: (task: Task) => void;
  className?: string;
}

export const TodoListPanel: React.FC<TodoListPanelProps> = ({ tasks, subagents = [], onTaskClick, className }) => {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['pending', 'in_progress']));
  const [taskGraph, setTaskGraph] = useState<TaskGraph | null>(null);

  useEffect(() => {
    if (tasks.length > 0) {
      setTaskGraph(new TaskGraph(tasks));
    } else {
      setTaskGraph(null);
    }
  }, [tasks]);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(section)) {
        newSet.delete(section);
      } else {
        newSet.add(section);
      }
      return newSet;
    });
  };

  const getTasksByStatus = (status: Task['status']) => {
    return tasks.filter(t => t.status === status);
  };

  const getStatusIcon = (status: Task['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 size={14} className="text-green-400" />;
      case 'in_progress':
        return <Clock size={14} className="text-blue-400 animate-spin" />;
      case 'failed':
        return <AlertCircle size={14} className="text-red-400" />;
      case 'cancelled':
        return <Ban size={14} className="text-gray-500" />;
      default:
        return <Circle size={14} className="text-gray-400" />;
    }
  };

  const getPriorityColor = (priority: Task['priority']) => {
    switch (priority) {
      case 'critical':
        return 'text-red-400 bg-red-400/10 border-red-400/20';
      case 'high':
        return 'text-orange-400 bg-orange-400/10 border-orange-400/20';
      case 'medium':
        return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20';
      case 'low':
        return 'text-gray-400 bg-gray-400/10 border-gray-400/20';
    }
  };

  // Derive active sub-agents from delegated tasks
  const activeSubagents = subagents.filter(child => child.status === 'queued' || child.status === 'running');

  const sections = [
    { id: 'in_progress', label: 'In Progress', tasks: getTasksByStatus('in_progress') },
    { id: 'pending', label: 'Pending', tasks: getTasksByStatus('pending') },
    { id: 'completed', label: 'Completed', tasks: getTasksByStatus('completed') },
    { id: 'failed', label: 'Failed', tasks: getTasksByStatus('failed') },
    { id: 'cancelled', label: 'Cancelled', tasks: getTasksByStatus('cancelled') },
  ];

  const visibleSections = sections.filter(s => s.tasks.length > 0);

  if (tasks.length === 0) {
    return (
      <div className={cn("p-4 text-center text-gray-500 text-sm", className)}>
        <ListTodo size={24} className="mx-auto mb-2 opacity-50" />
        <p>No tasks created yet</p>
        <p className="text-[10px] mt-1 opacity-60">The agent will create tasks when processing complex requests.</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>

      {/* ── Active Sub-Agents Panel (shown at TOP when agents are running) ── */}
      <AnimatePresence>
        {activeSubagents.length > 0 && (
          <motion.div
            key="subagents"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="rounded-lg border border-blue-500/30 bg-blue-500/5 overflow-hidden"
          >
            <div className="flex items-center gap-2 px-3 py-2 border-b border-blue-500/20">
              <Bot size={14} className="text-blue-400" />
              <span className="text-xs font-semibold text-blue-300">Active Sub-Agents</span>
              <span className="text-[10px] text-blue-400/60">({activeSubagents.length} running)</span>
              <span className="ml-auto relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
              </span>
            </div>
            <div className="p-2 space-y-1.5">
              {activeSubagents.map(child => {
                const task = tasks.find(item => item.id === child.taskId);
                return <div key={child.childId} className="flex items-start gap-2 px-2 py-1.5 rounded-md bg-blue-500/10 border border-blue-500/20">
                  <Zap size={12} className="text-blue-400 mt-0.5 shrink-0 animate-pulse" />
                  <div className="min-w-0">
                    <div className="text-[10px] font-mono text-blue-300 truncate">{child.role} · {child.status}</div>
                    <div className="text-[10px] text-blue-200/70 truncate mt-0.5">{task?.title || child.taskId}</div>
                  </div>
                </div>;
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-3 py-2 bg-white/5 rounded-lg border border-white/10">
        <div className="flex items-center gap-2">
          <ListTodo size={16} className="text-purple-400" />
          <span className="text-xs font-semibold text-white">Agent Tasks</span>
          <span className="text-[10px] text-gray-400">({tasks.length})</span>
        </div>
        {taskGraph && (
          <div className="text-[10px] text-gray-400">
            {taskGraph.getStats().completedTasks}/{taskGraph.getStats().totalTasks} done
          </div>
        )}
      </div>

      {/* ── Task Sections ── */}
      <div className="space-y-1">
        {visibleSections.map(section => (
          <div key={section.id} className="rounded-lg bg-black/20 border border-white/5 overflow-hidden">
            {/* Section Header */}
            <button
              onClick={() => toggleSection(section.id)}
              className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center gap-2">
                {expandedSections.has(section.id) ? (
                  <ChevronDown size={14} className="text-gray-400" />
                ) : (
                  <ChevronRight size={14} className="text-gray-400" />
                )}
                <span className="text-xs font-medium text-gray-300">{section.label}</span>
                <span className="text-[10px] text-gray-500">({section.tasks.length})</span>
              </div>
            </button>

            {/* Section Tasks */}
            <AnimatePresence>
              {expandedSections.has(section.id) && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="p-2 space-y-1">
                    {section.tasks.map(task => (
                      <div
                        key={task.id}
                        onClick={() => onTaskClick?.(task)}
                        className={cn(
                          "flex items-start gap-2 p-2 rounded-md cursor-pointer transition-colors",
                          "hover:bg-white/5 border border-transparent hover:border-white/10"
                        )}
                      >
                        {/* Status Icon */}
                        <div className="mt-0.5 shrink-0">
                          {getStatusIcon(task.status)}
                        </div>

                        {/* Task Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-medium text-white truncate">
                              {task.title}
                            </span>
                            <span
                              className={cn(
                                "text-[9px] px-1.5 py-0.5 rounded border shrink-0",
                                getPriorityColor(task.priority)
                              )}
                            >
                              {task.priority}
                            </span>
                          </div>
                          {task.description && (
                            <p className="text-[10px] text-gray-400 line-clamp-2">
                              {task.description}
                            </p>
                          )}
                          {/* Delegated Badge */}
                          {task.delegatedTo && (
                            <div className="flex items-center gap-1 mt-1">
                              <Bot size={10} className="text-blue-400 shrink-0" />
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 truncate">
                                {task.delegatedTo}
                              </span>
                            </div>
                          )}
                          {/* Dependencies */}
                          {task.dependencies.length > 0 && (
                            <div className="flex items-center gap-1 mt-1">
                              <span className="text-[9px] text-gray-500">Depends on:</span>
                              {task.dependencies.slice(0, 2).map(depId => {
                                const depTask = tasks.find(t => t.id === depId);
                                return depTask ? (
                                  <span
                                    key={depId}
                                    className={cn(
                                      "text-[9px] px-1 py-0.5 rounded",
                                      depTask.status === 'completed'
                                        ? "bg-green-400/10 text-green-400"
                                        : "bg-yellow-400/10 text-yellow-400"
                                    )}
                                  >
                                    {depTask.title.slice(0, 8)}...
                                  </span>
                                ) : null;
                              })}
                              {task.dependencies.length > 2 && (
                                <span className="text-[9px] text-gray-500">
                                  +{task.dependencies.length - 2}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>

      {/* ── Progress Bar ── */}
      {taskGraph && taskGraph.getStats().totalTasks > 0 && (
        <div className="px-3 py-2 bg-white/5 rounded-lg border border-white/10">
          <div className="flex justify-between text-[10px] text-gray-400 mb-1.5">
            <span>Overall Progress</span>
            <span>{Math.round((taskGraph.getStats().completedTasks / taskGraph.getStats().totalTasks) * 100)}%</span>
          </div>
          <div className="w-full bg-white/10 rounded-full h-1.5">
            <motion.div
              className="bg-gradient-to-r from-purple-500 to-blue-500 h-1.5 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${(taskGraph.getStats().completedTasks / taskGraph.getStats().totalTasks) * 100}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
          <div className="grid grid-cols-3 gap-1 mt-2 text-[10px]">
            <div className="text-center">
              <div className="text-yellow-400">{taskGraph.getStats().pendingTasks}</div>
              <div className="text-gray-500">Pending</div>
            </div>
            <div className="text-center">
              <div className="text-blue-400">{taskGraph.getStats().inProgressTasks}</div>
              <div className="text-gray-500">Running</div>
            </div>
            <div className="text-center">
              <div className="text-green-400">{taskGraph.getStats().completedTasks}</div>
              <div className="text-gray-500">Done</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
