import LoadingSpinner from '@/components/LoadingSpinner';
export default function Loading() {
  return (
    <div className="min-h-screen" style={{ background: '#f3f5f7' }}>
      <LoadingSpinner />
    </div>
  );
}
