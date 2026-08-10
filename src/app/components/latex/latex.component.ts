import { Component, Input, OnChanges, SimpleChanges, ElementRef, inject } from '@angular/core';
import katex from 'katex';

@Component({
  selector: 'app-latex',
  standalone: true,
  template: '',
  styles: [`
    :host {
      display: inline-block;
    }
  `]
})
export class LatexComponent implements OnChanges {
  @Input() content = '';
  
  private el = inject(ElementRef);

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['content']) {
      this.renderLatex();
    }
  }

  private renderLatex() {
    try {
      // Manejar la mezcla de texto normal y LaTeX encerrado en $$ o $$
      let html = this.content || '';
      
      // Reemplazar $$...$$ con math en bloque
      html = html.replace(/\$\$([\s\S]*?)\$\$/g, (match, math) => {
        return katex.renderToString(math, { displayMode: true, throwOnError: false });
      });
      
      // Reemplazar $...$ con math en línea
      html = html.replace(/\$([^$]*?)\$/g, (match, math) => {
        return katex.renderToString(math, { displayMode: false, throwOnError: false });
      });
      
      // Reemplazar saltos de línea con <br> para texto normal
      html = html.replace(/\n/g, '<br>');

      this.el.nativeElement.innerHTML = html;
    } catch (e) {
      console.error('KaTeX error:', e);
      this.el.nativeElement.textContent = this.content;
    }
  }
}
