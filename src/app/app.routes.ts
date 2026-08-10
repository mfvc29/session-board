import { Routes } from '@angular/router';
import { Home } from './home/home';
import { Board } from './board/board';

export const routes: Routes = [
  { path: '', component: Home },
  { path: 'board/:id', component: Board },
];
