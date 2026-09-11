export default function LoadingSpinner({ className = '' }: { className?: string }) {
  return (
    <div className={`min-h-[200px] flex items-center justify-center ${className}`}>
      <div className="w-8 h-8 rounded-full border-3 border-emerald-200 border-t-emerald-600 animate-spin" />
    </div>
  );
}
