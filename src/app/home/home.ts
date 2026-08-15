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
  selectedRole = signal<'mentor' | 'student' | null>(null);
  
  private auth = inject(Auth);
  private boardService = inject(BoardService);

  constructor(private router: Router) {
    const savedRole = localStorage.getItem('virtual_board_role');
    if (savedRole === 'mentor' || savedRole === 'student') {
      this.selectedRole.set(savedRole);
    }
    authState(this.auth).subscribe(u => this.user.set(u));
  }

  async loginGoogle() {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(this.auth, provider);
  }

  async selectRole(role: 'mentor' | 'student') {
    try {
      if (!this.user()) {
        await this.loginGoogle();
      }
      this.selectedRole.set(role);
      localStorage.setItem('virtual_board_role', role);
    } catch (e) {
      console.error("Login cancelled or failed", e);
    }
  }

  async logout() {
    await this.auth.signOut();
    this.selectedRole.set(null);
    localStorage.removeItem('virtual_board_role');
  }

  clearRole() {
    this.selectedRole.set(null);
    localStorage.removeItem('virtual_board_role');
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
      if (!this.user()) {
        alert("Debes iniciar sesión para unirte.");
        return;
      }
      const name = this.user().displayName || 'Alumno';
      this.router.navigate(['/board', this.joinCode()], { queryParams: { role: 'student', name } });
    } else {
      alert('El código debe tener 6 dígitos.');
    }
  }
}
