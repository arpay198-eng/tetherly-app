export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startAutoVerifyScheduler } = await import('./lib/autoVerifyScheduler');
    startAutoVerifyScheduler();
  }
}