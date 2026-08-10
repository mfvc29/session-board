import { Injectable, inject } from '@angular/core';
import { Firestore, doc, docData, setDoc, updateDoc, arrayUnion, deleteDoc } from '@angular/fire/firestore';
import { Observable } from 'rxjs';

export interface StrokeData {
  id: string;
  points: number[][];
  color: string;
  path?: string;
}

export interface SessionData {
  htmlContent?: string;
  strokes: StrokeData[];
  images?: string[];
}

@Injectable({
  providedIn: 'root'
})
export class BoardService {
  private firestore = inject(Firestore);

  // Genera un código de 4 dígitos
  generateSessionCode(): string {
    return Math.floor(1000 + Math.random() * 9000).toString();
  }

  // Crea una sesión inicial
  async createSession(sessionId: string): Promise<void> {
    const sessionRef = doc(this.firestore, `sessions/${sessionId}`);
    await setDoc(sessionRef, { strokes: [] });
  }

  // Observa los cambios de la sesión en tiempo real
  getSession(sessionId: string): Observable<SessionData> {
    const sessionRef = doc(this.firestore, `sessions/${sessionId}`);
    return docData(sessionRef) as Observable<SessionData>;
  }

  // Agrega un trazo a la sesión
  async addStroke(sessionId: string, stroke: StrokeData): Promise<void> {
    const sessionRef = doc(this.firestore, `sessions/${sessionId}`);
    await updateDoc(sessionRef, {
      strokes: arrayUnion(stroke)
    });
  }

  // Limpia los trazos de la sesión
  async clearStrokes(sessionId: string): Promise<void> {
    const sessionRef = doc(this.firestore, `sessions/${sessionId}`);
    await updateDoc(sessionRef, {
      strokes: []
    });
  }

  // Sincroniza el HTML subido
  async updateSessionHtml(sessionId: string, htmlContent: string): Promise<void> {
    const sessionRef = doc(this.firestore, `sessions/${sessionId}`);
    await updateDoc(sessionRef, {
      htmlContent
    });
  }

  // Agrega una imagen extra (en base64)
  async addImage(sessionId: string, base64Image: string): Promise<void> {
    const sessionRef = doc(this.firestore, `sessions/${sessionId}`);
    await updateDoc(sessionRef, {
      images: arrayUnion(base64Image)
    });
  }

  // Finaliza la sesión (borra el documento)
  async endSession(sessionId: string): Promise<void> {
    const sessionRef = doc(this.firestore, `sessions/${sessionId}`);
    await deleteDoc(sessionRef);
  }
}
