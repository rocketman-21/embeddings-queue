export interface StoryAnalysis {
  id: string;
  title: string;
  summary: string;
  keyPoints: string[];
  participants: string[];
  timeline: {
    timestamp: string;
    event: string;
  }[];
  sentiment: 'positive' | 'negative' | 'neutral';
  completeness: number;
  complete: boolean;
  sources: string[];
  mediaUrls: string[];
  author?: string;
  headerImage: string;
  tagline: string;
  castHashes: string[];
  edits?: {
    timestamp: string;
    message: string;
    address: string;
  }[];
  infoNeededToComplete?: string;
  mintUrls?: string[];
  createdAt: string;
}
