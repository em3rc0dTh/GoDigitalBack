// src/services/schedulerService.ts
import cron from 'node-cron';
import { renewExpiredWatches } from './gmail/watch';
import { syncService } from './syncService';

class SchedulerService {
    /**
     * Inicia todas las tareas programadas
     */
    public start() {
        console.log("🕒 [Scheduler] Iniciando programador de tareas...");

        // 1. Renovación de Gmail Watch
        // Se ejecuta cada 12 horas para asegurar que ningún watch expire
        cron.schedule('0 */12 * * *', async () => {
            console.log("🔄 [Scheduler] Ejecutando renovación de Gmail Watches...");
            try {
                await renewExpiredWatches();
            } catch (err) {
                console.error("❌ [Scheduler] Error renovando watches:", err);
            }
        });

        // 2. Sincronización Global de Datos (Gmail + IMAP + Web + PDF)
        // Se ejecuta una vez al día a las 2:00 AM (hora de bajo tráfico)
        cron.schedule('0 2 * * *', async () => {
            console.log("🔄 [Scheduler] Ejecutando Sincronización Global diaria...");
            try {
                await syncService.syncAllTenants();
            } catch (err) {
                console.error("❌ [Scheduler] Error en sincronización global:", err);
            }
        });

        // Tarea opcional: Limpieza de logs o archivos temporales (si es necesario)
        // cron.schedule('0 3 * * 0', async () => { ... });

        console.log("✅ [Scheduler] Tareas programadas: Gmail Watch (12h), Global Sync (Diaria 2 AM)");
    }
}

export const schedulerService = new SchedulerService();
