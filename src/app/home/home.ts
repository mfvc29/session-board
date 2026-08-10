import { Component, signal, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Auth, signInWithPopup, GoogleAuthProvider, authState } from '@angular/fire/auth';
import { BoardService } from '../board/board.service';

@Component({
  selector: 'app-home',
  imports: [FormsModule],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home {
  joinCode = signal('');
  createCode = signal('');
  user = signal<any>(null);
  
  private auth = inject(Auth);
  private boardService = inject(BoardService);

  constructor(private router: Router) {
    authState(this.auth).subscribe(u => this.user.set(u));
  }

  async loginGoogle() {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(this.auth, provider);
  }

  async logout() {
    await this.auth.signOut();
  }

  async createSession() {
    if (this.createCode().length === 6) {
      const code = this.createCode();
      
      // Creamos la sesión en Firebase sin esperar (fire-and-forget) para evitar bloqueos de red
      this.boardService.createSession(code).catch(e => console.error('Error al crear sesión:', e));
      
      this.router.navigate(['/board', code], { 
        queryParams: { role: 'teacher' }
      });
    } else {
      alert('El código debe tener 6 dígitos.');
    }
  }

  joinSession() {
    if (this.joinCode().length === 6) {
      this.router.navigate(['/board', this.joinCode()], { queryParams: { role: 'student' } });
    } else {
      alert('El código debe tener 6 dígitos.');
    }
  }
}
