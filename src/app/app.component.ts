import { CommonModule } from '@angular/common';
import { Component, ElementRef, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterOutlet } from '@angular/router';
import { ParseSvgService, BoundingBox } from './parse-svg/parse-svg.service';
import { Path } from 'opentype.js';
import hexRgb from 'hex-rgb';
import rgbHex from 'rgb-hex';


@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    CommonModule,
    FormsModule,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  svgContent: string | null = null;

  // svg div viewchild
  @ViewChild('svgContainer') svgContainer!: ElementRef<HTMLCanvasElement>;

  constructor(
    private parseSvgService: ParseSvgService
  ) {}

  public onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      const reader = new FileReader();

      reader.onload = (e: any) => {
        // SVG content as a string
        const svgString = e.target.result as string;
        this.svgContent = svgString;  // Display the SVG

        // Render the SVG paths on the canvas
        this.prepareCanvas(svgString);
      };

      reader.readAsText(file);
    }
  }

  public prepareCanvas(svgString: string): void {
    // Create a new DOMParser to parse the SVG string
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgString, 'image/svg+xml');
    
    // Get the first SVG element from the parsed SVG document
    const svgElement = svgDoc.querySelector('svg');
    if (!svgElement) {
      console.error('No SVG element found in the file.');
      return;
    }

    // Get the paths from the SVG
    const paths = svgElement.querySelectorAll('path');
    // needed for line color checks
    const logoFillColor = paths[0].getAttribute('fill');

    // paths that I will extract from the single path element in the logo
    let pathElements: Path[] = [];
    let boundingBox: BoundingBox = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

    // if there are multiple path elements, combine them into a single path
    let combindedPathData = '';
    paths.forEach(pathElement => {
      const pathData = pathElement.getAttribute('d') || '';
      combindedPathData += pathData;
    });

    // get the paths and bounding box from the combined path data
    if(combindedPathData) {
      let pathsWithBoundingBox = this.parseSvgService.parseSvg(combindedPathData);
      pathElements = pathsWithBoundingBox.paths;
      boundingBox = pathsWithBoundingBox.boundingBox;
    }

    // Set up the canvas
    const svgCanvas = document.getElementById('svgCanvas') as HTMLCanvasElement;
    const ctx = svgCanvas.getContext('2d');

    // DRAW 1: DRAW THE LOGO IN RANDOM COLORS FOR SEGMENTATION
    this.renderSegmentedCanvas(svgElement, svgCanvas, ctx);
    this.renderImageSegments(pathElements, ctx!);  

    // GET IMAGE SEGMENTS FROM THE COLORED IMAGE
    let imageSegments = this.renderImageSegments(pathElements, ctx!);

    // DRAW 2: DRAW THE LOGO IN THE ORIGINAL COLORS ON THE SECOND CANVAS
    // Set up the canvas
    const svgCanvasOriginal = document.getElementById('originalCanvas') as HTMLCanvasElement;
    const ctxOriginal = svgCanvasOriginal.getContext('2d');
    this.renderOriginalCanvas(svgElement, svgCanvasOriginal, ctxOriginal, combindedPathData, logoFillColor!);  

    this.getOutlineColors(
      ctx!, 
      svgCanvas, 
      ctxOriginal!, 
      svgCanvasOriginal, 
      imageSegments, 
      logoFillColor!
    );

    this.renderOutlineSvg(imageSegments.map(segment => segment.path), boundingBox);
  }

  getOutlineColors(
    ctx: CanvasRenderingContext2D,
    segmentedCanvas: HTMLCanvasElement,
    ctxOriginal: CanvasRenderingContext2D,
    originalCanvas: HTMLCanvasElement,
    imageSegments: ImageSegment[],
    logoFillColor: string,
  ) {

    // get the pixel data from both canvases
    const imageData = ctx!.getImageData(0, 0, segmentedCanvas.width, segmentedCanvas.height);
    const imageDataOriginal = ctxOriginal!.getImageData(0, 0, originalCanvas.width, originalCanvas.height);

    // for each path, find the first pixel on the randomly colored canvas that matches its fill color
    // and then color the corresponding pixel on the original canvas with the original fill color
    const pixelData = imageData.data;
    const originalPixelData = imageDataOriginal.data;

    for(const segment of imageSegments) {
      const {red, green, blue} = hexRgb(segment.color);

      for(let i = 0; i < pixelData.length; i += 4) {
        const r = pixelData[i];
        const g = pixelData[i + 1];
        const b = pixelData[i + 2];

        // find the first pixel of the corresponding color
        if (r === red && g === green && b === blue) {

          // check the corresponding pixel on the original canvas
          let originalR = originalPixelData[i];
          let originalG = originalPixelData[i + 1];
          let originalB = originalPixelData[i + 2];
          

          const originalHexColor = this.rgbToHex(originalR, originalG, originalB);
          if(originalHexColor.toLowerCase() == logoFillColor!.toLowerCase()) {
            segment.path.stroke = '#FF0000';
          }
          else {
            segment.path.stroke = '#0000FF';
          }
          segment.path.fill = 'none'

          break; // stop after the first pixel is found
        }
      }

    }
  }
  renderImageSegments(pathElements: Path[], ctx: CanvasRenderingContext2D) {
    const imageSegments: ImageSegment[] = [];

    // Draw the paths with randomly assigned colors to the canvas
    // this is used for segmentation, because every path will have its
    // unique fill color
    pathElements.forEach(pathElement => {
      const pathData = pathElement.toDOMElement(2).getAttribute('d') || '';
      const fillColor = this.getRandomHexColor();
      imageSegments.push({ path: pathElement, color: fillColor });
      const strokeColor = 'none';

      this.drawPathOnCanvas(pathData, fillColor, strokeColor, ctx);
    });

    return imageSegments;
  }

  drawPathOnCanvas (
    pathData: string, 
    fillColor: string, 
    strokeColor: string,
    ctx: CanvasRenderingContext2D
  ) {
    const path = new Path2D(pathData);
    ctx.fillStyle = fillColor;
    ctx.fill(path);
    ctx.strokeStyle = strokeColor;
    ctx.stroke(path);
  };

  renderOriginalCanvas(
    svgElement: SVGSVGElement, 
    svgCanvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D | null,
    combinedPathData: string,
    logoFillColor: string,

  ) {
    if (!ctx) {
      console.error('Canvas 2D context not available.');
      return;
    }

    const svgWidth = svgElement.viewBox.baseVal.width || svgElement.getAttribute('width');
    const svgHeight = svgElement.viewBox.baseVal.height || svgElement.getAttribute('height');
    if (svgWidth && svgHeight) {
      const scaleFactor = 2;
      svgCanvas.width = scaleFactor*(+svgWidth);
      svgCanvas.height = scaleFactor*(+svgHeight);

      ctx.scale(scaleFactor, scaleFactor);
    }

    // Clear the canvas before rendering
    ctx.clearRect(0, 0, svgCanvas.width, svgCanvas.height);

    this.drawPathOnCanvas(combinedPathData, logoFillColor!, 'none', ctx);
  }
  renderSegmentedCanvas(
    svgElement: SVGSVGElement, 
    svgCanvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D | null
  ) {

    if (!ctx) {
      console.error('Canvas 2D context not available.');
      return;
    }

    const svgWidth = svgElement.viewBox.baseVal.width || svgElement.getAttribute('width');
    const svgHeight = svgElement.viewBox.baseVal.height || svgElement.getAttribute('height');
    if (svgWidth && svgHeight) {
      const scaleFactor = 2;
      svgCanvas.width = scaleFactor*(+svgWidth);
      svgCanvas.height = scaleFactor*(+svgHeight);

      ctx.scale(scaleFactor, scaleFactor);
    }

    // Clear the canvas before rendering
    ctx.clearRect(0, 0, svgCanvas.width, svgCanvas.height);

    // render the paths with random colors
  }

  // find the svg element in the template and render
  // the red and blue colored paths
  renderOutlineSvg(paths: Path[], boundingBox: BoundingBox) {
    const svgElement = this.svgContainer.nativeElement;
    const svgDoc = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    
    const {minX, minY, maxX, maxY} = boundingBox;

    const width = maxX - minX;
    const height = maxY - minY;
    const viewBox = `${minX} ${minY} ${width} ${height}`;

    paths.forEach(path => {
      const pathElement = path.toDOMElement(2);
      pathElement.setAttribute('fill', 'none');
      pathElement.setAttribute('stroke', path.stroke!);
      svgDoc.appendChild(pathElement);
    });
    svgDoc.setAttribute('viewBox', viewBox);

    svgElement.innerHTML = svgDoc.outerHTML;
  }
  rgbToHex(r: number, g: number, b: number) {
    return '#' + rgbHex(r, g, b);
  }
  getRandomHexColor() {
    // Generate a random integer between 0 and 0xFFFFFF (decimal 16777215)
    const randomColor = Math.floor(Math.random() * 0xFFFFFF);
  
    // Convert the integer to a hexadecimal string and pad with leading zeros if needed
    const hexColor = `#${randomColor.toString(16).padStart(6, '0')}`;
  
    return hexColor;
  }

}

export type ImageSegment = {
  path: Path;
  color: string;
};