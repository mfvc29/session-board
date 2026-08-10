import { Component, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-home',
  imports: [FormsModule],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home {
  joinCode = signal('');
  createCode = signal('');

  constructor(private router: Router) {}

  createSession() {
    if (this.createCode().length === 6) {
      this.router.navigate(['/board', this.createCode()], { queryParams: { role: 'teacher' } });
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
