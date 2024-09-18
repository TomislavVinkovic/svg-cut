// @ts-nocheck

import { Injectable } from '@angular/core';
import { Path } from 'opentype.js';
import { parseSVG, makeAbsolute, CommandMadeAbsolute, CurveToCommandMadeAbsolute, SmoothCurveToCommandMadeAbsolute, QuadraticCurveToCommandMadeAbsolute, SmoothQuadraticCurveToCommandMadeAbsolute } from 'svg-path-parser';

@Injectable({
  providedIn: 'root'
})
export class ParseSvgService {

  isCurveTo(cmd: CommandMadeAbsolute): cmd is CurveToCommandMadeAbsolute {
    return cmd.command === 'curveto';
  }
	isSmoothCurveTo(cmd: CommandMadeAbsolute) {
    return cmd.command === 'smooth curveto';
  }

	isQuadraticCurveTo(cmd: CommandMadeAbsolute): cmd is QuadraticCurveToCommandMadeAbsolute {
    return cmd.command === 'quadratic curveto';
  }

	isSmoothQuadraticCurveTo(cmd: CommandMadeAbsolute): cmd is SmoothQuadraticCurveToCommandMadeAbsolute {
    return cmd.command === 'smooth quadratic curveto';
  }

  parseSvg(pathData: string): PathsWithBoundingBox {
    let paths: Path[] = [];
    let path = new Path();
    const parsedCommands = parseSVG(pathData);
    const absoluteCommands = makeAbsolute(parsedCommands);

    let minX = Number.MAX_VALUE;
    let minY = Number.MAX_VALUE;
    let maxX = Number.MIN_VALUE;
    let maxY = Number.MIN_VALUE;

    // Use opentype functions for commands
    absoluteCommands.forEach((cmd, index) => {
      switch (cmd.code) {
        case 'M':
          if (path.commands.length > 0) {
            paths.push(path);
            path = new Path();
          }
          path.moveTo(cmd.x, cmd.y);
          break;
        case 'L':
        case 'H':
        case 'V':
          path.lineTo(cmd.x, cmd.y);
          break;
        case 'C':
          if (this.isCurveTo(cmd)) {
            path.curveTo(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y);
          }
          break;
        case 'S':
          if (this.isSmoothCurveTo(cmd)) {
            const prevCmd = absoluteCommands[index - 1];
            let x1: number, y1: number;
            if (this.isCurveTo(prevCmd) || this.isSmoothCurveTo(prevCmd)) {
              x1 = prevCmd.x * 2 - prevCmd.x2;
              y1 = prevCmd.y * 2 - prevCmd.y2;
            } else {
              x1 = prevCmd.x;
              y1 = prevCmd.y;
            }
            path.curveTo(x1, y1, cmd.x2, cmd.y2, cmd.x, cmd.y);
          }
          break;
        case 'Q':
          if (this.isQuadraticCurveTo(cmd)) {
            path.quadraticCurveTo(cmd.x1, cmd.y1, cmd.x, cmd.y);
          }
          break;
        case 'T':
          if (this.isSmoothQuadraticCurveTo(cmd)) {
            const prevCmd = absoluteCommands[index - 1];
            let x1: number, y1: number;

            if (this.isQuadraticCurveTo(prevCmd)) {
              x1 = prevCmd.x * 2 - prevCmd.x1;
              y1 = prevCmd.y * 2 - prevCmd.y1;
            } else if (this.isSmoothQuadraticCurveTo(prevCmd)) {
              // For smooth quad curves, we don't have x1/y1, so we use the current point
              x1 = prevCmd.x;
              y1 = prevCmd.y;
            } else {
              x1 = prevCmd.x;
              y1 = prevCmd.y;
            }

            path.quadraticCurveTo(x1, y1, cmd.x, cmd.y);
          }
          break;
        case 'A':
          console.warn("Arc command 'A' is not directly supported by opentypejs. Fallback to line.");
          path.lineTo(cmd.x, cmd.y);
          break;
        case 'Z':
          path.closePath();
          paths.push(path);
          path = new Path();
          break;
        default:
          console.warn("Unsupported command: ", cmd);
          break;
      }

      // update the bounding box
      minX = Math.min(minX, cmd.x);
      minY = Math.min(minY, cmd.y);
      maxX = Math.max(maxX, cmd.x);
      maxY = Math.max(maxY, cmd.y);
    });

    paths = this.sortByNumberOfChildren(paths);

    // add some padding to the bounding box
    return {
      paths: paths,
      boundingBox: {
        minX: minX - 20,
        minY: minY - 20,
        maxX: maxX + 20,
        maxY: maxY + 20
      }
    };
  }

  sortByNumberOfChildren(pathElements: Path[]) {
    const pathsWithChildren: Path[][] = [];
    pathElements.forEach(pathElement => {
      pathsWithChildren.push([pathElement]);
    });

    for(let i = 0; i < pathsWithChildren.length; i++) {
      const parentPath = pathsWithChildren[i][0];
      for(let j = 0; j < pathElements.length; j++) {
        if(i != j) {
          const childPath = pathElements[j];
          if(this.isPathInside(parentPath, childPath)) {
            pathsWithChildren[i].push(childPath);
          }
        }
      }
    }

    // sort paths with children by number of children
    pathsWithChildren.sort((a, b) => {
      return b.length - a.length;
    });

    return pathsWithChildren.map(paths => {
      return paths[0];
    });
  }

  isPathInside(parent: Path, child: Path) {
    const parentPoints = this.pathToPoints(parent);
		const childPoints = this.pathToPoints(child);
	
    // Check if all points of the smaller path are inside the main path
    const allPointsInside = childPoints.every(point => this.isPointInPath(point, parentPoints));

    if (allPointsInside) {
      return true;
    }
		return false;
  }

  isPointInPath(point: Point, pathPoints: Point[]) {
    let inside = false;
		for (let i = 0, j = pathPoints.length - 1; i < pathPoints.length; j = i++) {
			const xi = pathPoints[i].x, yi = pathPoints[i].y;
			const xj = pathPoints[j].x, yj = pathPoints[j].y;
			
			const intersect = ((yi > point.y) !== (yj > point.y)) &&
				(point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
			if (intersect) inside = !inside;
		}
		return inside;
  }

  pathToPoints(path: Path): Point[] {
    let points: Point[] = [];
    path.commands.forEach(cmd => {
      if ('x' in cmd && 'y' in cmd) {
        points.push(new Point(cmd.x, cmd.y));
      }
    });
    return points;
  }
}
class Point {
  x: number;
  y: number;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }
}


export type BoundingBox = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
export type PathsWithBoundingBox = {
  paths: Path[];
  boundingBox: BoundingBox;
}