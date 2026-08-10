import { Injectable, inject } from '@angular/core';
import { Firestore, doc, docData, setDoc, updateDoc, deleteDoc, collection, collectionData, addDoc, writeBatch, query, getDocs } from '@angular/fire/firestore';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

export interface StrokeData {
  id: string;
  points: number[][];
  color: string;
  path: string;
}

export interface SessionData {
  htmlContent?: string;
  images?: string[];
}

@Injectable({
  providedIn: 'root'
})
export class BoardService {
  private firestore = inject(Firestore);

  processHtmlTemplate(html: string): string {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const problems = doc.querySelectorAll('.problem-item');
      
      problems.forEach(p => {
        const boardSpace = doc.createElement('div');
        boardSpace.className = 'injected-board-space';
        boardSpace.style.cssText = `
          height: 500px;
          border: 2px dashed #aaa;
          margin-top: 20px;
          margin-bottom: 20px;
          border-radius: 8px;
          background: rgba(200,200,255,0.05);
          position: relative;
        `;
        p.appendChild(boardSpace);
      });
      
      return doc.documentElement.outerHTML;
    } catch (e) {
      console.error('Error processing HTML template', e);
      return html;
    }
  }

  generateSessionCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // Crea la sesión - guarda SOLO el HTML y las imágenes (NO los trazos)
  async createSession(sessionId: string, htmlContent?: string): Promise<void> {
    const sessionRef = doc(this.firestore, `sessions/${sessionId}`);
    const data: any = {};
    if (htmlContent) {
      data.htmlContent = htmlContent;
    }
    await setDoc(sessionRef, data);
  }

  // Observa los metadatos de la sesión (HTML + imágenes)
  getSession(sessionId: string): Observable<SessionData> {
    const sessionRef = doc(this.firestore, `sessions/${sessionId}`);
    return (docData(sessionRef) as Observable<SessionData>).pipe(
      catchError(() => of({} as SessionData))
    );
  }

  // Trazos como subcolección separada (mucho más eficiente)
  getStrokes(sessionId: string): Observable<StrokeData[]> {
    const strokesRef = collection(this.firestore, `sessions/${sessionId}/strokes`);
    return collectionData(strokesRef, { idField: 'id' }) as Observable<StrokeData[]>;
  }

  async addStroke(sessionId: string, stroke: StrokeData): Promise<void> {
    const strokesRef = collection(this.firestore, `sessions/${sessionId}/strokes`);
    await addDoc(strokesRef, {
      points: stroke.points,
      color: stroke.color,
      path: stroke.path,
    });
  }

  async clearStrokes(sessionId: string): Promise<void> {
    const strokesRef = collection(this.firestore, `sessions/${sessionId}/strokes`);
    const snapshot = await getDocs(query(strokesRef));
    const batch = writeBatch(this.firestore);
    snapshot.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
  }

  async updateSessionHtml(sessionId: string, htmlContent: string): Promise<void> {
    const sessionRef = doc(this.firestore, `sessions/${sessionId}`);
    await updateDoc(sessionRef, { htmlContent });
  }

  async addImage(sessionId: string, base64Image: string): Promise<void> {
    const sessionRef = doc(this.firestore, `sessions/${sessionId}`);
    const current = (await getDocs(query(collection(this.firestore, `sessions/${sessionId}/strokes`)))).empty;
    await updateDoc(sessionRef, {
      images: base64Image
    });
  }

  async endSession(sessionId: string): Promise<void> {
    // Borra subcolección de trazos primero
    const strokesRef = collection(this.firestore, `sessions/${sessionId}/strokes`);
    const snapshot = await getDocs(query(strokesRef));
    const batch = writeBatch(this.firestore);
    snapshot.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    // Borra el documento principal
    const sessionRef = doc(this.firestore, `sessions/${sessionId}`);
    await deleteDoc(sessionRef);
  }
}
