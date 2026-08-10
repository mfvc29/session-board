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
  fileName = signal('');
  selectedHtmlContent = signal('');
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

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.fileName.set(file.name);
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        if (result) {
          this.selectedHtmlContent.set(result);
        }
      };
      reader.readAsText(file);
    }
  }

  async createSession() {
    if (this.createCode().length === 6) {
      const code = this.createCode();
      const htmlContent = this.selectedHtmlContent();
      
      // Creamos la sesión en Firebase antes de navegar
      await this.boardService.createSession(code, htmlContent);
      
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
