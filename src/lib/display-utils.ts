export function getScoreColor(score: number, max: number): string {
  const percentage = (score / max) * 100;
  if (percentage >= 80) return 'text-blue-600';
  if (percentage >= 60) return 'text-[#3b82f6]';
  if (percentage >= 40) return 'text-orange-500';
  return 'text-red-500';
}

export function getPerformanceBadge(percentage: number): { label: string; color: string; borderColor: string } {
  if (percentage >= 80) return { label: 'Excellent', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', borderColor: 'border-blue-300 dark:border-blue-700' };
  if (percentage >= 60) return { label: 'Good', color: 'bg-[#3b82f6]/10 text-[#3b82f6]', borderColor: 'border-[#3b82f6]/30' };
  if (percentage >= 40) return { label: 'Satisfactory', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400', borderColor: 'border-orange-300 dark:border-orange-700' };
  return { label: 'Needs Improvement', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', borderColor: 'border-red-300 dark:border-red-700' };
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' \u2022 ' + date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
