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

  constructor(private router: Router) {}

  createSession() {
    // Generate a random 4 digit code
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    // For now, just navigate to it. Later we save to Firebase.
    this.router.navigate(['/board', code]);
  }

  joinSession() {
    if (this.joinCode().length === 4) {
      this.router.navigate(['/board', this.joinCode()]);
    } else {
      alert('El código debe tener 4 dígitos.');
    }
  }
}
