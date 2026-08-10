import { Component, input, output } from '@angular/core';
import { LucideAngularModule, PenTool, Eraser, Undo, Trash2, FileCode2, Image, MousePointer2, Power } from 'lucide-angular';

@Component({
  selector: 'app-toolbar',
  imports: [LucideAngularModule],
  templateUrl: './toolbar.html',
  styleUrl: './toolbar.scss',
})
export class Toolbar {
  currentColor = input<string>('#ffffff');
  colorChange = output<string>();
  clear = output<void>();
  uploadHtml = output<File>();
  uploadImage = output<File>();
  endSession = output<void>();
  toggleMode = output<'draw' | 'pointer'>();

  currentMode = 'draw';

  readonly PenTool = PenTool;
  readonly Eraser = Eraser;
  readonly MousePointer2 = MousePointer2;
  readonly Undo = Undo;
  readonly Trash2 = Trash2;
  readonly FileCode2 = FileCode2;
  readonly Image = Image;
  readonly Power = Power;
  
  colors = ['#ffffff', '#ff4757', '#2ed573', '#1e90ff', '#ffa502'];

  selectColor(color: string) {
    this.colorChange.emit(color);
  }

  onClear() {
    this.clear.emit();
  }

  onHtmlSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.uploadHtml.emit(input.files[0]);
    }
  }

  onImageSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.uploadImage.emit(input.files[0]);
    }
  }

  setMode(mode: 'draw' | 'pointer') {
    this.currentMode = mode;
    this.toggleMode.emit(mode);
  }
}
