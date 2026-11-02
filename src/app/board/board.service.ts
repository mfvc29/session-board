import { Injectable, inject } from '@angular/core';
import { Firestore, doc, docData, setDoc, updateDoc, deleteDoc, collection, collectionData, addDoc, writeBatch, query, getDocs, serverTimestamp } from '@angular/fire/firestore';
import { EMPTY, Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ShapeKind } from './shapes';

export interface StrokeData {
  id: string;
  color: string;
  path: string;
  exerciseId?: string;
  /** 'shape' paths are outlines (stroke); pen paths (default) are filled outlines. */
  type?: 'pen' | 'shape';
  width?: number;
  /** Editable shapes keep their kind and drag box so they can be moved/resized. */
  shape?: ShapeKind;
  x0?: number;
  y0?: number;
  x1?: number;
  y1?: number;
  /** Dashed back edges of 3D solids. */
  hiddenPath?: string;
}

export interface Exercise {
  id: string;
  statement: string;
  options?: { a: string; b: string; c: string; d: string; };
}

export interface SessionData {
  exercises?: Exercise[];
  images?: string[];
}

export interface StudentRequest {
  id: string;
  name: string;
  status: 'pending' | 'approved' | 'rejected';
  joinedAt?: any;
}

@Injectable({ providedIn: 'root' })
export class BoardService {
  private firestore = inject(Firestore);

  generateSessionCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  async createSession(sessionId: string): Promise<void> {
    const sessionRef = doc(this.firestore, `sessions/${sessionId}`);
    await setDoc(sessionRef, { exercises: [], images: [] });
  }

  getSession(sessionId: string): Observable<SessionData> {
    const sessionRef = doc(this.firestore, `sessions/${sessionId}`);
    return (docData(sessionRef) as Observable<SessionData>).pipe(
      catchError(err => {
        console.error('Error in getSession:', err);
        return of({} as SessionData);
      })
    );
  }

  getStrokes(sessionId: string): Observable<StrokeData[]> {
    const strokesRef = collection(this.firestore, `sessions/${sessionId}/strokes`);
    return (collectionData(strokesRef, { idField: 'id' }) as Observable<StrokeData[]>).pipe(
      catchError(err => {
        // EMPTY (not []) so an error never looks like "every stroke was deleted"
        console.error('Error in getStrokes:', err);
        return EMPTY;
      })
    );
  }

  async addStroke(sessionId: string, stroke: StrokeData): Promise<void> {
    const strokesRef = collection(this.firestore, `sessions/${sessionId}/strokes`);
    const data = this.toStrokeDoc(stroke);
    
    if (stroke.id && !stroke.id.startsWith('temp-')) {
      // If we provided an ID, use setDoc instead of addDoc to keep it
      const docRef = doc(this.firestore, `sessions/${sessionId}/strokes/${stroke.id}`);
      await setDoc(docRef, data);
    } else {
      await addDoc(strokesRef, data);
    }
  }

  async updateStroke(sessionId: string, stroke: StrokeData): Promise<void> {
    const ref = doc(this.firestore, `sessions/${sessionId}/strokes/${stroke.id}`);
    await setDoc(ref, this.toStrokeDoc(stroke));
  }

  /** Firestore rejects undefined values, so drop them along with the id. */
  private toStrokeDoc(stroke: StrokeData) {
    const { id, ...fields } = stroke;
    return Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
  }

  async deleteStroke(sessionId: string, strokeId: string): Promise<void> {
    const ref = doc(this.firestore, `sessions/${sessionId}/strokes/${strokeId}`);
    try {
      await deleteDoc(ref);
    } catch (err) {
      console.error('Error deleting stroke:', err);
    }
  }

  async clearStrokes(sessionId: string): Promise<void> {
    const strokesRef = collection(this.firestore, `sessions/${sessionId}/strokes`);
    const snapshot = await getDocs(query(strokesRef));
    const batch = writeBatch(this.firestore);
    snapshot.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
  }

  async updateExercises(sessionId: string, exercises: Exercise[]): Promise<void> {
    const sessionRef = doc(this.firestore, `sessions/${sessionId}`);
    try {
      await setDoc(sessionRef, { exercises }, { merge: true });
    } catch (err) { 
      console.error('Error in updateExercises:', err);
    }
  }

  // ===== STUDENT WAITING ROOM =====

  /** Student requests to join — creates a pending entry */
  async requestJoin(sessionId: string, studentId: string, studentName: string): Promise<void> {
    const ref = doc(this.firestore, `sessions/${sessionId}/students/${studentId}`);
    await setDoc(ref, {
      id: studentId,
      name: studentName,
      status: 'pending',
      joinedAt: serverTimestamp()
    });
  }

  /** Teacher watches all student requests */
  getStudentRequests(sessionId: string): Observable<StudentRequest[]> {
    const ref = collection(this.firestore, `sessions/${sessionId}/students`);
    return (collectionData(ref, { idField: 'id' }) as Observable<StudentRequest[]>).pipe(
      catchError(err => {
        console.error('Error in getStudentRequests:', err);
        return of([]);
      })
    );
  }

  /** Teacher approves a student */
  async approveStudent(sessionId: string, studentId: string): Promise<void> {
    const ref = doc(this.firestore, `sessions/${sessionId}/students/${studentId}`);
    await updateDoc(ref, { status: 'approved' });
  }

  /** Teacher rejects a student */
  async rejectStudent(sessionId: string, studentId: string): Promise<void> {
    const ref = doc(this.firestore, `sessions/${sessionId}/students/${studentId}`);
    await updateDoc(ref, { status: 'rejected' });
  }

  /** Student watches their own request status */
  watchMyStatus(sessionId: string, studentId: string): Observable<StudentRequest | null> {
    const ref = doc(this.firestore, `sessions/${sessionId}/students/${studentId}`);
    return (docData(ref) as Observable<StudentRequest>).pipe(
      catchError(err => {
        console.error('Error in watchMyStatus:', err);
        return of(null);
      })
    );
  }

  async endSession(sessionId: string): Promise<void> {
    const strokesRef = collection(this.firestore, `sessions/${sessionId}/strokes`);
    const snapshot = await getDocs(query(strokesRef));
    const batch = writeBatch(this.firestore);
    snapshot.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    const sessionRef = doc(this.firestore, `sessions/${sessionId}`);
    await deleteDoc(sessionRef);
  }
}
