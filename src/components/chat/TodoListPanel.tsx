import React, { useState, useEffect } from 'react';
import { CheckCircle2, Circle, ListTodo, Clock, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../App';
import { Task } from '../../lib/taskStore';
import { TaskGraph } from '../../lib/taskGraph';

interface TodoListPanelProps {
  tasks: Task[];
  onTaskClick?: (task: Task) => void;
  className?: string;
}

export const TodoListPanel: React.FC<TodoListPanelProps> = ({ tasks, onTaskClick, className }) => {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['pending', 'in_progress']));
  const [taskGraph, setTaskGraph] = useState<TaskGraph | null>(null);

  useEffect(() => {
    if (tasks.length > 0) {
      setTaskGraph(new TaskGraph(tasks));
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

  const sections = [
    { id: 'in_progress', label: 'In Progress', tasks: getTasksByStatus('in_progress') },
    { id: 'pending', label: 'Pending', tasks: getTasksByStatus('pending') },
    { id: 'completed', label: 'Completed', tasks: getTasksByStatus('completed') },
    { id: 'failed', label: 'Failed', tasks: getTasksByStatus('failed') },
  ];

  const visibleSections = sections.filter(s => s.tasks.length > 0);

  if (tasks.length === 0) {
    return (
      <div className={cn("p-4 text-center text-gray-500 text-sm", className)}>
        <ListTodo size={24} className="mx-auto mb-2 opacity-50" />
        <p>No tasks created yet</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {/* Header */}
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

      {/* Task Sections */}
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
                                "text-[9px] px-1.5 py-0.5 rounded border",
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

      {/* Task Graph Stats */}
      {taskGraph && (
        <div className="px-3 py-2 bg-white/5 rounded-lg border border-white/10">
          <div className="text-[10px] text-gray-400 mb-2">Task Graph Stats</div>
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div className="flex justify-between">
              <span className="text-gray-500">Total:</span>
              <span className="text-white">{taskGraph.getStats().totalTasks}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Pending:</span>
              <span className="text-yellow-400">{taskGraph.getStats().pendingTasks}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">In Progress:</span>
              <span className="text-blue-400">{taskGraph.getStats().inProgressTasks}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Completed:</span>
              <span className="text-green-400">{taskGraph.getStats().completedTasks}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Failed:</span>
              <span className="text-red-400">{taskGraph.getStats().failedTasks}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Max Depth:</span>
              <span className="text-purple-400">{taskGraph.getStats().maxDepth}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
