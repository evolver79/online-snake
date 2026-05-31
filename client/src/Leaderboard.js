import { createClient } from '@supabase/supabase-js';
const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
export class Leaderboard {
    constructor(onRemoteScore) {
        this.onRemoteScore = onRemoteScore;
        this.channel = null;
        this.myLastSubmittedName = null;
    }
    async fetchTop(limit = 10) {
        const { data, error } = await supabase
            .from('scores')
            .select('id, name, score, created_at')
            .order('score', { ascending: false })
            .limit(limit);
        if (error)
            throw error;
        return (data ?? []);
    }
    async submit(name, score) {
        this.myLastSubmittedName = name;
        const { error } = await supabase.from('scores').insert({ name, score });
        if (error)
            throw error;
    }
    subscribe() {
        this.channel = supabase
            .channel('public:scores')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'scores' }, payload => {
            const row = payload.new;
            // Suppress notification for our own just-submitted score
            if (row.name === this.myLastSubmittedName) {
                this.myLastSubmittedName = null;
                return;
            }
            this.onRemoteScore(row.name, row.score);
        })
            .subscribe();
    }
    unsubscribe() {
        if (this.channel) {
            supabase.removeChannel(this.channel);
            this.channel = null;
        }
    }
}
