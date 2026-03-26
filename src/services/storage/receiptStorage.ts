import fs from 'fs/promises';
import path from 'path';

export class ReceiptStorageService {
    private basePath: string;

    constructor() {
        this.basePath = process.env.PDF_STORAGE_PATH || './uploads';
    }

    /**
     * Sanitizes a string to be used as a directory or file name.
     */
    private sanitizeName(name: string): string {
        return name
            .toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove accents
            .replace(/[^a-z0-9]/g, '_') // Replace non-alphanumeric with _
            .replace(/_+/g, '_')         // Replace multiple _ with one
            .replace(/(^_|_$)/g, '');    // Remove leading/trailing _
    }

    /**
     * Calculates the bi-monthly period folder name (YYYY-MM1-MM2).
     */
    private calculatePeriod(date: Date): string {
        const year = date.getFullYear();
        const month = date.getMonth() + 1; // 1-12

        // Grouping: 1-2, 3-4, 5-6, 7-8, 9-10, 11-12
        const startMonth = month % 2 === 0 ? month - 1 : month;
        const endMonth = startMonth + 1;

        const sm = startMonth.toString().padStart(2, '0');
        const em = endMonth.toString().padStart(2, '0');

        return `${year}-${sm}-${em}`;
    }

    /**
     * Prepares the folder structure and returns the full destination path.
     */
    async prepareDestination(employeeName: string, source: string, type: string, date: Date = new Date()) {
        const sEmployee = this.sanitizeName(employeeName);
        const sSource = this.sanitizeName(source);
        const sType = this.sanitizeName(type);
        const period = this.calculatePeriod(date);

        const relativeDir = path.join(sEmployee, sSource, sType, period);
        const absoluteDir = path.resolve(this.basePath, relativeDir);

        await fs.mkdir(absoluteDir, { recursive: true });

        return {
            absoluteDir,
            relativeDir
        };
    }

    /**
     * Saves a file buffer to the hierarchy.
     */
    async saveFile(buffer: Buffer, originalName: string, employeeName: string, source: string, type: string) {
        const { absoluteDir, relativeDir } = await this.prepareDestination(employeeName, source, type);
        
        // Ensure unique filename if it exists? or overwrite
        const extension = path.extname(originalName);
        const baseName = this.sanitizeName(path.basename(originalName, extension));
        const finalFileName = `${baseName}_${Date.now()}${extension}`;
        
        const absoluteFilePath = path.join(absoluteDir, finalFileName);
        const relativeFilePath = path.join(relativeDir, finalFileName);

        await fs.writeFile(absoluteFilePath, buffer);

        return {
            absolutePath: absoluteFilePath,
            relativePath: relativeFilePath,
            fileName: finalFileName,
            period: this.calculatePeriod(new Date())
        };
    }
}

export const receiptStorage = new ReceiptStorageService();
