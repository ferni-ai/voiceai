/**
 * Data Export Service
 *
 * Handles GDPR-compliant data export and deletion.
 * Gathers data from localStorage and backend, formats for download.
 */

import { createLogger } from '../utils/logger.js';
import { ritualsService } from './rituals.service.js';
import { 
  relationshipStageService, 
  getRelationshipStage,
} from './relationship-stage.service.js';

const log = createLogger('DataExport');

// ============================================================================
// TYPES
// ============================================================================

export interface ExportData {
  exportedAt: string;
  version: string;
  categories: {
    conversations?: ConversationExport[];
    insights?: InsightExport[];
    rituals?: RitualExport[];
    predictions?: PredictionExport[];
    moodHistory?: MoodExport[];
    relationship?: RelationshipExport;
    preferences?: PreferencesExport;
  };
}

interface ConversationExport {
  id: string;
  date: string;
  personaId: string;
  personaName: string;
  duration: number;
  messageCount: number;
  transcript?: string[];
}

interface InsightExport {
  id: string;
  content: string;
  category: string;
  learnedAt: string;
  personaId: string;
}

interface RitualExport {
  id: string;
  name: string;
  description: string;
  frequency: string;
  preferredTime: string;
  streak: number;
  createdAt: string;
  completedDates: string[];
}

interface PredictionExport {
  id: string;
  question: string;
  category: string;
  userPrediction: number;
  actualOutcome?: number;
  status: string;
  createdAt: string;
}

interface MoodExport {
  date: string;
  primary: string;
  energy: string;
  note?: string;
}

interface RelationshipExport {
  stage: string;
  daysKnown: number;
  totalConversations: number;
  lastConversation: string | null;
  favoritePersona: string | null;
}

interface PreferencesExport {
  theme: string;
  notificationsEnabled: boolean;
  spotifyLinked: boolean;
}

// ============================================================================
// DATA EXPORT SERVICE
// ============================================================================

class DataExportService {
  /**
   * Export user data in the specified format
   */
  async exportData(
    format: 'json' | 'csv',
    categories: string[]
  ): Promise<void> {
    log.info('Starting data export', { format, categories });

    try {
      const data = await this.gatherData(categories);
      
      if (format === 'json') {
        this.downloadJSON(data);
      } else {
        this.downloadCSV(data, categories);
      }

      log.info('Data export completed successfully');
    } catch (err) {
      log.error('Data export failed', err);
      throw err;
    }
  }

  /**
   * Delete all user data (GDPR right to erasure)
   */
  async deleteAllData(): Promise<void> {
    log.warn('Starting data deletion');

    try {
      // Clear local storage items
      const keysToRemove = [
        'ferni_user_rituals',
        'ferni_relationship_data',
        'ferni_user_id',
        'ferni_theme',
        'ferni_notifications',
        'ferni_onboarding_complete',
        'ferni_spotify_linked',
      ];

      for (const key of keysToRemove) {
        localStorage.removeItem(key);
      }

      // Clear rituals service
      ritualsService.clearAll();

      // Try to delete from backend
      const userId = localStorage.getItem('ferni_user_id');
      if (userId) {
        try {
          const response = await fetch('/api/export/all', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, confirmDelete: true }),
          });

          if (response.ok) {
            log.info('Backend data deleted');
          }
        } catch (err) {
          log.warn('Backend deletion failed, local data still cleared');
        }
      }

      log.info('All user data deleted');
    } catch (err) {
      log.error('Data deletion failed', err);
      throw err;
    }
  }

  /**
   * Gather data from all sources
   */
  private async gatherData(categories: string[]): Promise<ExportData> {
    const data: ExportData = {
      exportedAt: new Date().toISOString(),
      version: '1.0',
      categories: {},
    };

    // Gather conversations from backend
    if (categories.includes('Conversations')) {
      data.categories.conversations = await this.getConversations();
    }

    // Gather insights/memories from backend
    if (categories.includes('Insights')) {
      data.categories.insights = await this.getInsights();
    }

    // Gather rituals from local service
    if (categories.includes('Rituals')) {
      data.categories.rituals = this.getRituals();
    }

    // Gather predictions from backend
    if (categories.includes('Predictions')) {
      data.categories.predictions = await this.getPredictions();
    }

    // Gather mood history from backend
    if (categories.includes('Mood History')) {
      data.categories.moodHistory = await this.getMoodHistory();
    }

    // Always include relationship and preferences
    data.categories.relationship = this.getRelationshipData();
    data.categories.preferences = this.getPreferences();

    return data;
  }

  // ============================================================================
  // DATA GATHERERS
  // ============================================================================

  private async getConversations(): Promise<ConversationExport[]> {
    try {
      const userId = localStorage.getItem('ferni_user_id');
      if (!userId) return [];

      const response = await fetch(`/api/conversations?userId=${userId}&limit=100`);
      if (!response.ok) return [];

      const result = await response.json();
      return (result.sessions || []).map((s: Record<string, unknown>) => ({
        id: s.id,
        date: s.date || s.startTime,
        personaId: s.personaId,
        personaName: s.personaName,
        duration: s.duration,
        messageCount: s.messageCount,
        transcript: s.transcript || [],
      }));
    } catch {
      return [];
    }
  }

  private async getInsights(): Promise<InsightExport[]> {
    try {
      const userId = localStorage.getItem('ferni_user_id');
      if (!userId) return [];

      const response = await fetch(`/api/cognitive/memories?userId=${userId}`);
      if (!response.ok) return [];

      const result = await response.json();
      return (result.memories || []).map((m: Record<string, unknown>) => ({
        id: m.id,
        content: m.content,
        category: m.category,
        learnedAt: m.timestamp,
        personaId: m.personaId || 'ferni',
      }));
    } catch {
      return [];
    }
  }

  private getRituals(): RitualExport[] {
    const rituals = ritualsService.getAllRituals();
    return rituals.map(r => ({
      id: r.id,
      name: r.name,
      description: r.description,
      frequency: r.frequency,
      preferredTime: r.preferredTime,
      streak: r.streak,
      createdAt: r.createdAt,
      completedDates: r.completedDates,
    }));
  }

  private async getPredictions(): Promise<PredictionExport[]> {
    try {
      const userId = localStorage.getItem('ferni_user_id');
      if (!userId) return [];

      const response = await fetch(`/api/predictions?userId=${userId}&limit=100`);
      if (!response.ok) return [];

      const result = await response.json();
      return (result.predictions || []).map((p: Record<string, unknown>) => ({
        id: p.id,
        question: p.question,
        category: p.category,
        userPrediction: p.userPrediction,
        actualOutcome: p.actualOutcome,
        status: p.status,
        createdAt: p.createdAt,
      }));
    } catch {
      return [];
    }
  }

  private async getMoodHistory(): Promise<MoodExport[]> {
    try {
      const userId = localStorage.getItem('ferni_user_id');
      if (!userId) return [];

      const response = await fetch(`/api/analytics/user?userId=${userId}`);
      if (!response.ok) return [];

      const result = await response.json();
      return (result.moodTrends || []).map((m: Record<string, unknown>) => ({
        date: m.date,
        primary: m.mood,
        energy: m.energy,
        note: m.note,
      }));
    } catch {
      return [];
    }
  }

  private getRelationshipData(): RelationshipExport {
    const stage = getRelationshipStage();
    const metrics = relationshipStageService.getMetrics();
    return {
      stage,
      daysKnown: metrics.daysSinceFirstMeeting,
      totalConversations: metrics.totalConversations,
      lastConversation: null, // Not tracked at metrics level
      favoritePersona: null, // Not tracked at metrics level
    };
  }

  private getPreferences(): PreferencesExport {
    return {
      theme: localStorage.getItem('ferni_theme') || 'system',
      notificationsEnabled: localStorage.getItem('ferni_notifications') === 'true',
      spotifyLinked: localStorage.getItem('ferni_spotify_linked') === 'true',
    };
  }

  // ============================================================================
  // DOWNLOAD HELPERS
  // ============================================================================

  private downloadJSON(data: ExportData): void {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    this.triggerDownload(blob, `ferni-data-${this.getDateString()}.json`);
  }

  private downloadCSV(data: ExportData, _categories: string[]): void {
    const lines: string[] = [];
    
    // Add header
    lines.push('Ferni Data Export');
    lines.push(`Exported: ${data.exportedAt}`);
    lines.push('');

    // Export each category
    if (data.categories.conversations?.length) {
      lines.push('=== CONVERSATIONS ===');
      lines.push('ID,Date,Persona,Duration (min),Messages');
      for (const c of data.categories.conversations) {
        lines.push(`${c.id},${c.date},${c.personaName},${c.duration},${c.messageCount}`);
      }
      lines.push('');
    }

    if (data.categories.rituals?.length) {
      lines.push('=== RITUALS ===');
      lines.push('ID,Name,Frequency,Time,Streak,Created');
      for (const r of data.categories.rituals) {
        lines.push(`${r.id},"${r.name}",${r.frequency},${r.preferredTime},${r.streak},${r.createdAt}`);
      }
      lines.push('');
    }

    if (data.categories.insights?.length) {
      lines.push('=== INSIGHTS ===');
      lines.push('ID,Category,Content,Learned At');
      for (const i of data.categories.insights) {
        lines.push(`${i.id},${i.category},"${i.content.replace(/"/g, '""')}",${i.learnedAt}`);
      }
      lines.push('');
    }

    if (data.categories.predictions?.length) {
      lines.push('=== PREDICTIONS ===');
      lines.push('ID,Category,Question,Your Prediction,Actual,Status,Created');
      for (const p of data.categories.predictions) {
        lines.push(`${p.id},${p.category},"${p.question.replace(/"/g, '""')}",${p.userPrediction},${p.actualOutcome ?? ''},${p.status},${p.createdAt}`);
      }
      lines.push('');
    }

    if (data.categories.moodHistory?.length) {
      lines.push('=== MOOD HISTORY ===');
      lines.push('Date,Mood,Energy,Note');
      for (const m of data.categories.moodHistory) {
        lines.push(`${m.date},${m.primary},${m.energy},"${(m.note || '').replace(/"/g, '""')}"`);
      }
      lines.push('');
    }

    // Relationship summary
    if (data.categories.relationship) {
      const r = data.categories.relationship;
      lines.push('=== RELATIONSHIP ===');
      lines.push(`Stage: ${r.stage}`);
      lines.push(`Days Known: ${r.daysKnown}`);
      lines.push(`Total Conversations: ${r.totalConversations}`);
      lines.push('');
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    this.triggerDownload(blob, `ferni-data-${this.getDateString()}.csv`);
  }

  private triggerDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    log.info('Download triggered', { filename });
  }

  private getDateString(): string {
    const dateStr = new Date().toISOString().split('T')[0];
    return dateStr ?? 'export';
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const dataExportService = new DataExportService();

export default dataExportService;

