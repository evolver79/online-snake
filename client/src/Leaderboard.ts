import { createClient, RealtimeChannel } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string,
);

export interface ScoreRow {
  id: string;
  name: string;
  score: number;
  created_at: string;
}

export class Leaderboard {
  private channel: RealtimeChannel | null = null;
  private myLastSubmittedName: string | null = null;

  constructor(private onRemoteScore: (name: string, score: number) => void) {}

  async fetchTop(limit = 10): Promise<ScoreRow[]> {
    const { data, error } = await supabase
      .from('scores')
      .select('id, name, score, created_at')
      .order('score', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as ScoreRow[];
  }

  async submit(name: string, score: number): Promise<void> {
    this.myLastSubmittedName = name;
    const { error } = await supabase.from('scores').insert({ name, score });
    if (error) throw error;
  }

  subscribe(): void {
    this.channel = supabase
      .channel('public:scores')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'scores' },
        payload => {
          const row = payload.new as ScoreRow;
          // Suppress notification for our own just-submitted score
          if (row.name === this.myLastSubmittedName) {
            this.myLastSubmittedName = null;
            return;
          }
          this.onRemoteScore(row.name, row.score);
        },
      )
      .subscribe();
  }

  unsubscribe(): void {
    if (this.channel) {
      supabase.removeChannel(this.channel);
      this.channel = null;
    }
  }
}
