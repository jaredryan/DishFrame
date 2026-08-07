"use client";

import Link from "next/link";
import { Plus, NotebookPen, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Home dashboard's "Recently updated" section combines Recipes and Parts, so
 * its one compact create action opens a menu to each existing creation flow
 * rather than showing two permanent buttons.
 */
export function CreateDishMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm">
          <Plus />
          Create
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-fit">
        <DropdownMenuItem asChild>
          <Link href="/recipes/new">
            <NotebookPen /> Create recipe
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/parts/new">
            <Layers /> Create part
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
