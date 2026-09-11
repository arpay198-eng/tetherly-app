import LoadingSpinner from '@/components/LoadingSpinner';
export default function Loading() {
  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #e8fff1 0%, #e0f2fe 50%, #f3e8ff 100%)' }}>
      <LoadingSpinner />
    </div>
  );
}
