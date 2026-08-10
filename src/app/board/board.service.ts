import { Injectable, inject } from '@angular/core';
import { Firestore, doc, docData, getDoc, setDoc, updateDoc, deleteDoc, collection, collectionData, addDoc, writeBatch, query, getDocs } from '@angular/fire/firestore';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

export interface StrokeData {
  id: string;
  points: number[][];
  color: string;
  path: string;
}

export interface Exercise {
  id: string;
  statement: string;
  options?: {
    a: string;
    b: string;
    c: string;
    d: string;
  };
}

export interface SessionData {
  exercises?: Exercise[];
  images?: string[];
}

@Injectable({
  providedIn: 'root'
})
export class BoardService {
  private firestore = inject(Firestore);

  // Removed processHtmlTemplate

  generateSessionCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // Crea la sesión vacía
  async createSession(sessionId: string): Promise<void> {
    const sessionRef = doc(this.firestore, `sessions/${sessionId}`);
    await setDoc(sessionRef, { exercises: [], images: [] });
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

  async addExercise(sessionId: string, exercise: Exercise): Promise<void> {
    const sessionRef = doc(this.firestore, `sessions/${sessionId}`);
    const snapshot = await getDoc(sessionRef);
    if (snapshot.exists()) {
      const data = snapshot.data();
      const exercises = data?.['exercises'] || [];
      exercises.push(exercise);
      await updateDoc(sessionRef, { exercises });
    }
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
