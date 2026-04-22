import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6 pb-8 text-center">
          <div className="flex justify-center mb-4">
            <AlertCircle className="h-12 w-12 text-red-500" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">404</h1>
          <p className="text-xl font-semibold text-gray-700 mb-2">Página não encontrada</p>
          <p className="text-sm text-gray-500 mb-6">
            A página que você está procurando não existe ou foi movida.
          </p>
          <Link href="/">
            <Button className="rounded-xl">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar ao início
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
